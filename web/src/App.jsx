import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchStats, fetchAllItems, deleteItems, deleteInterview, toggleFlag, toggleResolve, setInterviewStatus, saveNote,
} from './api.js';
import Sidebar from './components/Sidebar.jsx';
import ItemsView from './components/ItemsView.jsx';
import Chat from './components/Chat.jsx';
import ImportDialog from './components/ImportDialog.jsx';
import Dashboard from './components/Dashboard.jsx';
import ConfirmDialog, { Modal } from './components/ConfirmDialog.jsx';
import ReviewMode from './components/ReviewMode.jsx';
import Icon from './components/Icon.jsx';
import { useToast } from './components/Toast.jsx';
import { QMETA, catOf, setCategories, findFreqGroups, viewFromHash, hashFromView } from './components/constants.js';

const SHORTCUTS = [
  ['/', '搜索题目'],
  ['j / k', '在列表里上下移动'],
  ['Enter', '展开 / 收起当前题'],
  ['e', '标记 / 取消已解决'],
  ['f', '标记 / 取消重点'],
  ['a', '问 AI 当前这道题'],
  ['空格', '复习模式：显示答案'],
  ['1 / 2', '复习模式：还不会 / 会了'],
  ['Esc', '关闭弹窗、面板或复习'],
  ['?', '打开这个列表'],
];

const titleOfView = (v) =>
  v.type === 'chat' ? '问答助手'
  : v.type === 'overview' ? '全部题目'
  : v.type === 'category' ? catOf(v.id).label
  : v.type === 'interview' ? `${v.company} 复盘`
  : '复习首页';

export default function App() {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [allItems, setAllItems] = useState([]);
  const itemsRef = useRef(allItems);
  itemsRef.current = allItems;
  const [loadState, setLoadState] = useState('loading'); // loading | ready | error
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState(viewFromHash);
  const viewRef = useRef(view);
  const [navOpen, setNavOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [delCompany, setDelCompany] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [review, setReview] = useState(null); // { items, title }
  const [ask, setAsk] = useState(null);       // { text, title, n }
  const [helpOpen, setHelpOpen] = useState(false);
  const mainRef = useRef(null);
  const nonce = useRef(0);

  const applyStats = (s) => { setCategories(s.categories); setStats(s); };

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const [s, items] = await Promise.all([fetchStats(), fetchAllItems()]);
      applyStats(s);
      setAllItems(items);
      setLoadState('ready');
    } catch (e) {
      setLoadError(e.message);
      setLoadState('error');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // ===== 路由：视图 <-> location.hash =====
  const navigate = useCallback((v) => {
    viewRef.current = v;
    setView(v);
    const h = hashFromView(v);
    if (window.location.hash !== h) window.location.hash = h;
  }, []);
  useEffect(() => {
    const onHash = () => {
      const v = viewFromHash();
      if (hashFromView(v) !== hashFromView(viewRef.current)) { viewRef.current = v; setView(v); }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // 切换视图：回到顶部（定位到某题时由列表自己滚动），更新标签页标题
  useEffect(() => {
    if (!view.focus) mainRef.current?.scrollTo(0, 0);
    document.title = `${titleOfView(view)} · 面经错题本`;
  }, [view]);

  // ===== 数据操作（先改界面，失败再回滚） =====
  const toggleField = (field, api, label) => async function run(id) {
    const cur = itemsRef.current.find((i) => i.id === id);
    if (!cur) return;
    const next = !cur[field];
    const setTo = (val) => setAllItems((items) => items.map((i) => (i.id === id ? { ...i, [field]: val } : i)));
    setTo(next);
    try {
      const r = await api(id);
      setTo(r[field]);
      if (field === 'resolved') {
        setAllItems((items) => items.map((i) => (i.id === id ? { ...i, resolvedAt: r.resolvedAt } : i)));
      }
      if (field === 'resolved' && r[field] && !document.querySelector('.review')) {
        toast('已标记为已解决', { tone: 'good', action: { label: '撤销', onClick: () => run(id) } });
      }
    } catch (e) {
      setTo(!next);
      toast(`${label}失败：${e.message}`, { tone: 'error' });
    }
  };
  const handleToggleResolve = toggleField('resolved', toggleResolve, '标记');
  const handleToggleFlag = toggleField('flagged', toggleFlag, '标记');

  /** 设为指定状态（复习模式用），已经是目标状态就不发请求 */
  const setResolved = (id, val) => {
    const cur = itemsRef.current.find((i) => i.id === id);
    if (cur && !!cur.resolved !== val) handleToggleResolve(id);
  };

  const handleSaveNote = async (id, note) => {
    try {
      const r = await saveNote(id, note);
      setAllItems((items) => items.map((i) => (i.id === id ? { ...i, note: r.note || undefined } : i)));
      return true;
    } catch (e) {
      toast(`保存订正失败：${e.message}`, { tone: 'error' });
      return false;
    }
  };

  /** 针对某道题问 AI：打开问答面板，在新对话里发出 */
  const askAbout = (item) => {
    const lines = [
      `这道面试题我当时${QMETA[item.quality].label}，请帮我给出一个更完整、适合面试口述的回答，并指出我漏掉的关键点。`,
      `题目：${item.question}`,
      `我当时答到的点：${item.answer_points.join('；')}`,
    ];
    if (item.note) lines.push(`我自己的订正：${item.note}`);
    setReview(null);
    if (viewRef.current.type !== 'chat') setChatOpen(true);
    setAsk({ text: lines.join('\n'), title: item.question.slice(0, 24), n: Date.now() });
  };

  const startReview = (items, title) => {
    if (!items.length) return;
    setChatOpen(false);
    setReview({ items, title });
  };

  // 全局快捷键：? 打开快捷键列表
  useEffect(() => {
    const h = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      if (e.key === '?') { e.preventDefault(); setHelpOpen((v) => !v); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const handleDeleteItems = async (ids) => {
    try {
      const r = await deleteItems(ids);
      setAllItems((items) => items.filter((i) => !ids.includes(i.id)));
      if (r?.stats) applyStats(r.stats);
      toast(`已删除 ${r?.removed ?? ids.length} 道题`);
      return true;
    } catch (e) {
      toast(`删除失败：${e.message}`, { tone: 'error' });
      return false;
    }
  };

  const doDeleteInterview = async () => {
    if (!delCompany || delBusy) return;
    setDelBusy(true);
    const company = delCompany;
    try {
      const r = await deleteInterview(company);
      setAllItems((items) => items.filter((i) => i.company !== company));
      if (r?.stats) applyStats(r.stats);
      if (viewRef.current.type === 'interview' && viewRef.current.company === company) navigate({ type: 'home' });
      setDelCompany(null);
      toast(`已删除「${company}」整场面试`);
    } catch (e) {
      toast(`删除失败：${e.message}`, { tone: 'error' });
    } finally {
      setDelBusy(false);
    }
  };

  const handleSetStatus = async (company, status) => {
    try {
      const r = await setInterviewStatus(company, status);
      if (r.stats) applyStats(r.stats);
    } catch (e) {
      toast(`更新结果失败：${e.message}`, { tone: 'error' });
    }
  };

  /** 从首页 / 问答跳到具体题目：进入该题所在的面试复盘并展开定位 */
  const gotoItem = (ref) => {
    const item = allItems.find((i) => i.id === ref.id);
    if (!item) { toast('这道题已被删除', { tone: 'error' }); return; }
    setChatOpen(false);
    navigate({ type: 'interview', company: item.company, focus: item.id, n: ++nonce.current });
  };

  const handleImported = async (r) => {
    if (r?.stats) applyStats(r.stats);
    try { setAllItems(await fetchAllItems()); } catch { /* 下次刷新再取 */ }
  };

  const freqGroups = useMemo(() => findFreqGroups(allItems), [allItems]);

  const isChatPage = view.type === 'chat';
  const itemsKey = `${hashFromView(view)}|${view.q || ''}|${view.focus || ''}|${view.n || ''}`;

  let content;
  if (loadState === 'loading' && !stats) {
    content = (
      <div className="skeleton" aria-busy="true" aria-label="正在加载">
        <div className="sk sk-title" /><div className="sk sk-line" />
        {Array.from({ length: 6 }, (_, i) => <div className="sk sk-row" key={i} />)}
      </div>
    );
  } else if (loadState === 'error') {
    content = (
      <div className="empty big" role="alert">
        <p><b>没能读取面经数据。</b></p>
        <p className="muted">{loadError}</p>
        <button className="btn primary" onClick={load}>重试</button>
      </div>
    );
  } else if (view.type === 'home') {
    content = (
      <Dashboard
        stats={stats} allItems={allItems} freqGroups={freqGroups}
        onNavigate={navigate}
        onOpenImport={() => setImportOpen(true)}
        onJumpToItem={gotoItem}
        onStartReview={startReview}
      />
    );
  } else if (!isChatPage) {
    content = (
      <ItemsView
        key={itemsKey}
        view={view} allItems={allItems} stats={stats} freqGroups={freqGroups}
        focusId={view.focus}
        onToggleFlag={handleToggleFlag}
        onToggleResolve={handleToggleResolve}
        onDeleteItems={handleDeleteItems}
        onSetStatus={handleSetStatus}
        onJumpToItem={gotoItem}
        onSaveNote={handleSaveNote}
        onAsk={askAbout}
        onStartReview={startReview}
      />
    );
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main">跳到正文</a>
      <Sidebar
        stats={stats} allItems={allItems} view={view}
        open={navOpen}
        onNavigate={navigate}
        onDeleteCompany={setDelCompany}
        onClose={() => setNavOpen(false)}
        onShowShortcuts={() => setHelpOpen(true)}
      />

      <main className="main" id="main" ref={mainRef}>
        <div className="topbar only-mobile">
          <button className="icon-btn" onClick={() => setNavOpen(true)} aria-label="打开导航"><Icon name="menu" /></button>
          <span className="topbar-title">面经错题本</span>
        </div>
        <div className="main-inner">{content}</div>
      </main>

      <Chat
        variant={isChatPage ? 'page' : 'panel'}
        open={chatOpen}
        onOpen={() => setChatOpen(true)}
        onClose={() => (isChatPage ? navigate({ type: 'home' }) : setChatOpen(false))}
        onJumpToItem={gotoItem}
        ask={ask}
      />

      {review && (
        <ReviewMode
          items={review.items}
          title={review.title}
          liveItems={allItems}
          onSetResolved={setResolved}
          onToggleFlag={handleToggleFlag}
          onAsk={askAbout}
          onClose={() => setReview(null)}
        />
      )}

      <Modal open={helpOpen} title="快捷键" onClose={() => setHelpOpen(false)} className="help-modal">
        <dl className="shortcuts">
          {SHORTCUTS.map(([k, d]) => (
            <div key={k}><dt>{k.split(' / ').map((x, i) => <React.Fragment key={x}>{i > 0 && ' / '}<kbd>{x}</kbd></React.Fragment>)}</dt><dd>{d}</dd></div>
          ))}
        </dl>
      </Modal>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={handleImported}
        onView={(company) => navigate({ type: 'interview', company })}
      />

      <ConfirmDialog
        open={!!delCompany}
        title="删除整场面试"
        message={`删除「${delCompany || ''}」整场面试？这场的所有题目和面试原文都会删除，无法恢复。`}
        confirmText="删除整场"
        danger
        busy={delBusy}
        onConfirm={doDeleteInterview}
        onClose={() => setDelCompany(null)}
      />
    </div>
  );
}
