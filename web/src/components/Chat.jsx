import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { chatStream } from '../api.js';
import { GradeMark } from './Icon.jsx';
import Icon from './Icon.jsx';
import Markdown from './Markdown.jsx';
import { useToast } from './Toast.jsx';
import { useEscape } from './ConfirmDialog.jsx';

const STORE_KEY = 'mianjing.chat.v2';
const SUGGESTIONS = [
  '我在哪些面试被问到过 SSE？怎么答比较好？',
  'React diff 我答得怎么样，怎么补强？',
  '帮我总结 Agent 相关的高频问题',
];

const newSession = () => ({ id: `s-${Date.now().toString(36)}`, title: '', msgs: [], updatedAt: Date.now() });

/** 读本地存储；隐私模式等情况下可能抛错，失败就从空会话开始 */
function loadSessions() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY));
    if (Array.isArray(raw?.sessions) && raw.sessions.length) {
      // 上次刷新时可能正在生成，恢复后去掉「生成中」状态
      raw.sessions.forEach((s) => s.msgs.forEach((m) => { if (m.pending) { m.pending = false; m.stopped = true; } }));
      return raw;
    }
  } catch { /* ignore */ }
  const s = newSession();
  return { sessions: [s], activeId: s.id };
}

const titleOf = (s) => s.title || s.msgs.find((m) => m.role === 'user')?.text.slice(0, 24) || '新对话';

/**
 * 问答助手：多会话，本地持久化
 * - page 形态：左侧会话列表 + 主聊天区
 * - panel 形态：右侧滑出面板，会话列表以浮层展示
 * 后端为 NestJS + LangGraph（retrieve -> generate）+ DeepSeek，SSE 流式返回
 */
export default function Chat({ open, onOpen, onClose, onJumpToItem, variant = 'panel', ask }) {
  const toast = useToast();
  const [{ sessions, activeId }, setState] = useState(loadSessions);
  const [listOpen, setListOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [input, setInput] = useState('');
  const [busyId, setBusyId] = useState(null);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const session = sessions.find((s) => s.id === activeId) || sessions[0];
  const busy = busyId === session.id;
  const isPage = variant === 'page';
  const visible = isPage || open;

  // 持久化（流式输出中也写，刷新不丢已生成部分）
  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ sessions, activeId })); } catch { /* ignore */ }
  }, [sessions, activeId]);

  // 新消息时：只有接近底部才自动滚动，避免打断用户往上翻
  const stick = useRef(true);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [session.msgs, activeId]);
  const onScroll = () => {
    const el = scrollRef.current;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // 输入框自适应高度
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => { if (visible) inputRef.current?.focus(); }, [visible, activeId]);

  useEscape(!isPage && open && !listOpen, onClose);
  useEscape(listOpen, () => setListOpen(false));

  const patch = (id, fn) => setState((st) => ({
    ...st,
    sessions: st.sessions.map((s) => (s.id === id ? { ...fn(s), updatedAt: Date.now() } : s)),
  }));
  const patchLastBot = (id, fn) => patch(id, (s) => {
    const msgs = s.msgs.slice();
    const last = msgs[msgs.length - 1];
    if (last?.role === 'bot') msgs[msgs.length - 1] = fn(last);
    return { ...s, msgs };
  });

  const send = (text = input) => {
    const q = text.trim();
    if (!q || busy) return;
    run(session.id, q, session.msgs);
  };

  /** 外部「问 AI」：在新对话里发出（当前对话为空则直接用当前的） */
  useEffect(() => {
    if (!ask?.text) return;
    if (busyId) stop();
    if (!session.msgs.length) { run(session.id, ask.text, [], ask.title); return; }
    const s = newSession();
    setState((st) => ({ sessions: [s, ...st.sessions], activeId: s.id }));
    run(s.id, ask.text, [], ask.title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask?.n]);

  async function run(sid, q, prior, title) {
    const history = prior
      .filter((m) => m.text && !m.error)
      .slice(-6)
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
    setInput('');
    setBusyId(sid);
    stick.current = true;
    patch(sid, (s) => ({ ...s, title: title || s.title, msgs: [...s.msgs, { role: 'user', text: q }, { role: 'bot', text: '', refs: [], pending: true }] }));

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await chatStream({ message: q, history, signal: ctrl.signal }, {
        onToken: (t) => patchLastBot(sid, (m) => ({ ...m, text: m.text + t })),
        onRefs: (refs) => patchLastBot(sid, (m) => ({ ...m, refs })),
        onError: (msg) => patchLastBot(sid, (m) => ({ ...m, text: m.text + `\n\n出错了：${msg}`, error: true })),
      });
    } catch (e) {
      if (e.name === 'AbortError') patchLastBot(sid, (m) => ({ ...m, stopped: true }));
      else patchLastBot(sid, (m) => ({ ...m, text: e.message, error: true }));
    } finally {
      patchLastBot(sid, (m) => ({ ...m, pending: false }));
      if (abortRef.current === ctrl) abortRef.current = null;
      setBusyId((cur) => (cur === sid ? null : cur));
    }
  }

  const stop = () => abortRef.current?.abort();

  const createSession = () => {
    // 当前就是空会话时直接复用，不堆积空对话
    if (!session.msgs.length) { setListOpen(false); inputRef.current?.focus(); return; }
    const s = newSession();
    setState((st) => ({ sessions: [s, ...st.sessions], activeId: s.id }));
    setListOpen(false);
    setInput('');
  };

  const switchTo = (id) => { setState((st) => ({ ...st, activeId: id })); setListOpen(false); };

  const removeSession = (id) => {
    if (busyId === id) stop();
    const snapshot = { sessions, activeId };
    setState((st) => {
      let rest = st.sessions.filter((s) => s.id !== id);
      if (!rest.length) rest = [newSession()];
      const nextActive = st.activeId === id ? rest[0].id : st.activeId;
      return { sessions: rest, activeId: nextActive };
    });
    toast('已删除对话', { action: { label: '撤销', onClick: () => setState(snapshot) } });
  };

  const commitRename = (id, value) => {
    const v = value.trim();
    if (v) patch(id, (s) => ({ ...s, title: v }));
    setRenaming(null);
  };

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast('已复制回答'); } catch { toast('复制失败，请手动选择文本', { tone: 'error' }); }
  };

  const kw = filter.trim().toLowerCase();
  const list = sessions
    .filter((s) => !kw || titleOf(s).toLowerCase().includes(kw) || s.msgs.some((m) => m.text.toLowerCase().includes(kw)))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const sessionList = (
    <>
      <div className="cs-tools">
        <input value={filter} placeholder="查找对话" aria-label="查找对话" onChange={(e) => setFilter(e.target.value)} />
        <button className="btn primary sm" onClick={createSession}><Icon name="plus" size={14} />新对话</button>
      </div>
      <ul className="cs-items">
        {!list.length && <li className="cs-empty">没有匹配的对话</li>}
        {list.map((s) => (
          <li key={s.id} className={`cs-item ${s.id === session.id ? 'on' : ''}`}>
            {renaming === s.id ? (
              <input
                className="cs-rename" defaultValue={titleOf(s)} autoFocus aria-label="对话名称"
                onBlur={(e) => commitRename(s.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(s.id, e.currentTarget.value);
                  if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null); }
                }}
              />
            ) : (
              <button className="cs-main" onClick={() => switchTo(s.id)}>
                <span className="cs-title">{titleOf(s)}</span>
                <span className="cs-sub">{s.msgs.length ? `${Math.ceil(s.msgs.length / 2)} 轮` : '空对话'}</span>
              </button>
            )}
            <span className="cs-ops">
              <button className="icon-btn" title="重命名" aria-label="重命名" onClick={() => setRenaming(s.id)}><Icon name="edit" size={14} /></button>
              <button className="icon-btn danger" title="删除" aria-label="删除对话" onClick={() => removeSession(s.id)}><Icon name="trash" size={14} /></button>
            </span>
          </li>
        ))}
      </ul>
    </>
  );

  const chatMain = (
    <>
      <div className="chat-head">
        {isPage
          ? <button className="icon-btn" onClick={onClose} aria-label="返回首页" title="返回首页"><Icon name="back" /></button>
          : <button className="btn ghost sm" onClick={() => setListOpen(true)}><Icon name="menu" size={14} />对话</button>}
        <span className="t">{titleOf(session)}</span>
        {isPage && <button className="btn ghost sm only-mobile" onClick={() => setListOpen(true)}><Icon name="menu" size={14} />对话</button>}
        {!isPage && (
          <>
            <button className="icon-btn" onClick={createSession} title="新对话" aria-label="新对话"><Icon name="plus" /></button>
            <button className="icon-btn" onClick={onClose} title="关闭（Esc）" aria-label="关闭"><Icon name="close" /></button>
          </>
        )}
      </div>

      <div className="chat-msgs" ref={scrollRef} onScroll={onScroll}>
        {session.msgs.length === 0 && (
          <div className="chat-welcome">
            <h3>问问你的面经</h3>
            <p>回答基于你录入的题目和面试原文，并附上参考的题目，点一下就能跳过去。</p>
            <div className="cw-suggestions">
              {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {session.msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role} ${m.error ? 'err' : ''}`}>
            {m.role === 'user' ? m.text : (
              <>
                {m.pending && !m.text
                  ? <span className="typing" aria-label="正在生成"><i /><i /><i /></span>
                  : <Markdown text={m.text} />}
                {m.stopped && <div className="msg-note">已停止生成</div>}
                {m.refs?.length > 0 && (
                  <div className="refs">
                    <div className="r-title">参考的题目</div>
                    {m.refs.map((r) => (
                      <button key={r.id} className="r-item" onClick={() => onJumpToItem?.(r)} title={r.question}>
                        <GradeMark quality={r.quality} size={14} />
                        <span className="r-q">{r.question}</span>
                        <span className="r-c">{r.company}</span>
                      </button>
                    ))}
                  </div>
                )}
                {!m.pending && m.text && !m.error && (
                  <button className="msg-copy" onClick={() => copy(m.text)}><Icon name="copy" size={13} />复制</button>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea
          ref={inputRef} rows={1}
          value={input}
          placeholder="问点什么，Enter 发送，Shift+Enter 换行"
          aria-label="输入问题"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
          }}
        />
        {busy ? (
          <button type="button" className="send stop" onClick={stop} aria-label="停止生成" title="停止生成">
            <Icon name="stop" size={14} strokeWidth={2.4} />
          </button>
        ) : (
          <button type="submit" className="send" disabled={!input.trim()} aria-label="发送" title="发送">
            <Icon name="send" size={16} strokeWidth={2} />
          </button>
        )}
      </form>
    </>
  );

  const listOverlay = listOpen && (
    <div className="session-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setListOpen(false); }}>
      <div className="session-sheet" role="dialog" aria-label="对话列表">
        <div className="modal-head">
          <h3>对话</h3>
          <button className="icon-btn" onClick={() => setListOpen(false)} aria-label="关闭"><Icon name="close" /></button>
        </div>
        {sessionList}
      </div>
    </div>
  );

  if (isPage) {
    return (
      <div className="chat-page">
        <aside className="chat-sessions" aria-label="对话列表">
          <div className="cs-head">对话</div>
          {sessionList}
        </aside>
        <div className="chat-main">{chatMain}{listOverlay}</div>
      </div>
    );
  }

  return (
    <>
      {!open && (
        <button className="chat-fab" title="问答助手" aria-label="打开问答助手" onClick={onOpen}>
          <Icon name="chat" size={22} />
        </button>
      )}
      <div className={`chat-panel ${open ? 'show' : ''}`} aria-hidden={!open} inert={open ? undefined : ''}>
        {chatMain}
        {listOverlay}
      </div>
    </>
  );
}
