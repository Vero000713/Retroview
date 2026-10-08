import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon, { GradeMark } from './Icon.jsx';
import { QMETA, catOf, splitRound } from './constants.js';

/**
 * 复习模式：逐题自测
 * 先看题回忆 → 显示答案 → 自评「还不会 / 会了」；「会了」同步标记为已解决
 * 快捷键：空格 显示答案，1 还不会，2 会了，F 标重点，← → 前后切换，Esc 退出
 */
export default function ReviewMode({ items: initial, title, liveItems, onSetResolved, onToggleFlag, onAsk, onClose }) {
  const [queue, setQueue] = useState(initial);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState({}); // id -> 'known' | 'again'
  const rootRef = useRef(null);

  // 题目的标记状态以 App 的最新数据为准
  const byId = useMemo(() => Object.fromEntries(liveItems.map((i) => [i.id, i])), [liveItems]);
  const done = idx >= queue.length;
  const item = done ? null : byId[queue[idx].id] || queue[idx];

  const go = (n) => { setIdx(Math.max(0, Math.min(queue.length, n))); setRevealed(false); };
  const grade = (r) => {
    if (!item) return;
    setResults((m) => ({ ...m, [item.id]: r }));
    if (r === 'known' && !item.resolved) onSetResolved(item.id, true);
    go(idx + 1);
  };

  useEffect(() => {
    const h = (e) => {
      if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
      if (e.key === 'Escape') { onClose(); return; }
      if (done) return;
      // 焦点在按钮上时交给按钮自己处理空格/回车，避免触发两次
      if ((e.key === ' ' || e.key === 'Enter') && document.activeElement?.tagName === 'BUTTON') return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); revealed ? grade('known') : setRevealed(true); }
      else if (revealed && e.key === '1') grade('again');
      else if (revealed && e.key === '2') grade('known');
      else if (e.key === 'ArrowRight') go(idx + 1);
      else if (e.key === 'ArrowLeft') go(idx - 1);
      else if (e.key.toLowerCase() === 'f') onToggleFlag(item.id);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  // 打开时把焦点移进复习层，避免空格键落到背后的按钮上
  useEffect(() => { rootRef.current?.focus(); }, [idx]);

  // 锁住背景滚动
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const known = Object.values(results).filter((r) => r === 'known').length;
  const again = queue.filter((q) => results[q.id] === 'again');

  return (
    <div className="review" role="dialog" aria-modal="true" aria-label="复习模式" tabIndex={-1} ref={rootRef}>
      <header className="review-top">
        <span className="review-title">{title}</span>
        <div className="review-progress" aria-label={`进度 ${Math.min(idx, queue.length)} / ${queue.length}`}>
          {queue.map((q, i) => (
            <span key={q.id} className={`rp ${results[q.id] || ''} ${i === idx ? 'cur' : ''}`} />
          ))}
        </div>
        <span className="review-count">{Math.min(idx + 1, queue.length)} / {queue.length}</span>
        <button className="icon-btn" onClick={onClose} aria-label="退出复习" title="退出（Esc）"><Icon name="close" /></button>
      </header>

      {done ? (
        <div className="review-card summary">
          <h2>这一轮复习完了</h2>
          <p>
            {queue.length} 道题里，<b className="good">{known}</b> 道会了（已标记解决），
            <b className="poor">{again.length}</b> 道还不会。
          </p>
          <div className="review-actions">
            {again.length > 0 && (
              <button className="btn primary" onClick={() => { setQueue(again); setResults({}); go(0); }}>
                <Icon name="undo" size={15} />再练还不会的 {again.length} 题
              </button>
            )}
            <button className="btn" onClick={onClose}>结束复习</button>
          </div>
        </div>
      ) : (
        <article className="review-card" key={item.id}>
          <div className="rc-meta">
            <GradeMark quality={item.quality} size={20} />
            <span>面试时{QMETA[item.quality].label}</span>
            <span className="q-cat"><i style={{ background: catOf(item.category).color }} />{catOf(item.category).label}</span>
            <span>{item.company} {splitRound(item.round).round}</span>
            <button
              className={`q-act flag ${item.flagged ? 'on' : ''}`} onClick={() => onToggleFlag(item.id)}
              title="标记为重点（F）" aria-pressed={!!item.flagged}
            >
              <Icon name="flag" size={15} />
            </button>
          </div>
          <h2 className="rc-q">{item.question}</h2>

          {revealed ? (
            <div className="rc-answer">
              <h4>当时答到的要点</h4>
              <ol>{item.answer_points.map((p, i) => <li key={i}>{p}</li>)}</ol>
              {item.note && (<><h4>我的订正</h4><p className="rc-note">{item.note}</p></>)}
              <button className="link-btn" onClick={() => onAsk(item)}>问 AI 怎么答更好</button>
            </div>
          ) : (
            <button className="rc-cover" onClick={() => setRevealed(true)}>
              先在心里答一遍，再看要点
              <span><kbd>空格</kbd> 显示答案</span>
            </button>
          )}

          <footer className="review-actions">
            <button className="icon-btn" onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="上一题" title="上一题（←）"><Icon name="back" /></button>
            <span className="spacer" />
            {revealed ? (
              <>
                <button className="btn grade-btn again" onClick={() => grade('again')}>还不会<kbd>1</kbd></button>
                <button className="btn grade-btn known" onClick={() => grade('known')}>会了<kbd>2</kbd></button>
              </>
            ) : (
              <button className="btn primary" onClick={() => setRevealed(true)}>显示答案</button>
            )}
            <span className="spacer" />
            <button className="icon-btn" onClick={() => go(idx + 1)} aria-label="跳过" title="跳过（→）"><Icon name="chevron" /></button>
          </footer>
        </article>
      )}
    </div>
  );
}
