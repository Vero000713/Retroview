import React from 'react';
import Icon, { GradeMark } from './Icon.jsx';
import { CATEGORIES, QMETA, INTERVIEW_STATUS, splitRound } from './constants.js';

const QORDER = { poor: 0, partial: 1, good: 2 };

/**
 * 复习首页：先回答「接下来该复习什么」，再给全局分布
 */
export default function Dashboard({
  stats, allItems, freqGroups,
  onNavigate, onOpenImport, onJumpToItem, onStartReview,
}) {
  const total = allItems.length;
  if (!total) {
    return (
      <div className="empty big">
        <p>还没有任何面经。</p>
        <button className="btn primary" onClick={onOpenImport}><Icon name="upload" size={15} />上传第一份面经</button>
      </div>
    );
  }

  const byQ = { good: 0, partial: 0, poor: 0 };
  const resolvedByQ = { good: 0, partial: 0, poor: 0 };
  for (const it of allItems) {
    byQ[it.quality] = (byQ[it.quality] || 0) + 1;
    if (it.resolved) resolvedByQ[it.quality] = (resolvedByQ[it.quality] || 0) + 1;
  }
  const weakTotal = byQ.partial + byQ.poor;
  const weakLeft = weakTotal - resolvedByQ.partial - resolvedByQ.poor;

  const pending = allItems
    .filter((i) => i.quality !== 'good' && !i.resolved)
    .sort((a, b) => (b.flagged ? 1 : 0) - (a.flagged ? 1 : 0) || QORDER[a.quality] - QORDER[b.quality]);
  const queue = pending.slice(0, 7);
  const weekAgo = Date.now() - 7 * 864e5;
  const thisWeek = allItems.filter((i) => i.resolved && i.resolvedAt > weekAgo).length;

  const catRows = CATEGORIES
    .map((c) => {
      const list = allItems.filter((i) => i.category === c.id);
      return { ...c, n: list.length, good: list.filter((i) => i.quality === 'good').length };
    })
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n);
  const maxCat = Math.max(...catRows.map((c) => c.n));

  const companies = Object.keys(stats?.byCompany || {}).map((company) => {
    const list = allItems.filter((i) => i.company === company);
    return {
      company,
      ...splitRound(list[0]?.round),
      n: list.length,
      good: list.filter((i) => i.quality === 'good').length,
      resolved: list.filter((i) => i.resolved).length,
      status: INTERVIEW_STATUS[stats.interviews?.[company]],
    };
  });

  return (
    <div className="dashboard">
      <header className="dash-head">
        <div>
          <h2>复习首页</h2>
          <p className="dash-lede">
            {weakLeft > 0
              ? <>{total} 道题里，还有 <b>{weakLeft}</b> 道没答好的题没解决。</>
              : <>{total} 道题里没答好的都已解决，可以换着复习答得不错的题。</>}
            {thisWeek > 0 && <span className="lede-week">这周解决了 {thisWeek} 道</span>}
          </p>
        </div>
        <div className="dash-actions">
          <button className="btn" onClick={onOpenImport}><Icon name="upload" size={15} />上传面经</button>
          <button className="btn primary" onClick={() => onNavigate({ type: 'chat' })}><Icon name="chat" size={15} />问答助手</button>
        </div>
      </header>

      {/* ===== 掌握度账本 ===== */}
      <section className="ledger" aria-label="掌握度">
        {['poor', 'partial', 'good'].map((q) => (
          <button key={q} className={`ledger-col ${q}`} onClick={() => onNavigate({ type: 'overview', q })}>
            <GradeMark quality={q} size={30} />
            <span className="ledger-num">{byQ[q]}</span>
            <span className="ledger-lbl">{QMETA[q].label}</span>
            <span className="ledger-sub">已解决 {resolvedByQ[q]}</span>
          </button>
        ))}
        <div className="ledger-bar" aria-hidden="true">
          {['poor', 'partial', 'good'].map((q) => (
            <span key={q} className={q} style={{ flexGrow: byQ[q] }} />
          ))}
        </div>
      </section>

      <div className="dash-cols">
        {/* ===== 待复习队列 ===== */}
        <section className="panel">
          <div className="panel-head">
            <h3>接下来复习</h3>
            <button className="link-btn" onClick={() => onNavigate({ type: 'overview', q: 'weak' })}>
              全部待加强（{weakTotal}）
            </button>
          </div>
          {pending.length > 0 && (
            <button className="review-start" onClick={() => onStartReview(pending, '待加强的题')}>
              <Icon name="play" size={16} />
              <span><b>开始复习</b>逐题自测 {pending.length} 道没解决的题，会了就划掉</span>
            </button>
          )}
          {queue.length ? (
            <ul className="queue">
              {queue.map((it) => (
                <li key={it.id}>
                  <button onClick={() => onJumpToItem(it)}>
                    <GradeMark quality={it.quality} size={18} />
                    <span className="qq">{it.question}</span>
                    <span className="qc">
                      {it.flagged && <Icon name="flag" size={13} className="flagged" />}
                      {it.company}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="panel-empty">没答好的题都已解决。</p>}
        </section>

        <div className="dash-stack">
          {/* ===== 高频考点 ===== */}
          <section className="panel">
            <div className="panel-head">
              <h3>多家公司都问过</h3>
              <span className="muted">优先准备</span>
            </div>
            {freqGroups.length ? (
              <ul className="queue">
                {freqGroups.slice(0, 8).map((g) => {
                  const comps = [...new Set(g.map((x) => x.company))];
                  return (
                    <li key={g[0].id}>
                      <button onClick={() => onJumpToItem(g[0])}>
                        <span className="freq-n">{g.length}</span>
                        <span className="qq">{g[0].question}</span>
                        <span className="qc">{comps.slice(0, 3).join('、')}{comps.length > 3 ? ' 等' : ''}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="panel-empty">暂时没有重复出现的题。</p>}
          </section>

          {/* ===== 分类分布 ===== */}
          <section className="panel">
            <div className="panel-head"><h3>按知识分类</h3><span className="muted">条长为题数，深色为答得不错</span></div>
            <ul className="cat-bars">
              {catRows.map((c) => (
                <li key={c.id}>
                  <button onClick={() => onNavigate({ type: 'category', id: c.id })} title={c.desc}>
                    <span className="cb-label">{c.label}</span>
                    <span className="cb-track">
                      <span className="cb-fill" style={{ width: `${(c.n / maxCat) * 100}%`, background: c.color }}>
                        <span className="cb-good" style={{ width: `${(c.good / c.n) * 100}%` }} />
                      </span>
                    </span>
                    <span className="cb-count">{c.n}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

        </div>
      </div>

        {/* ===== 面试场次 ===== */}
        <section className="panel">
          <div className="panel-head"><h3>按面试场次</h3><span className="muted">掌握率 / 复盘进度</span></div>
          <table className="iv-table">
            <tbody>
              {companies.map((c) => (
                <tr key={c.company} onClick={() => onNavigate({ type: 'interview', company: c.company })}>
                  <th scope="row">
                    <button onClick={(e) => { e.stopPropagation(); onNavigate({ type: 'interview', company: c.company }); }}>
                      {c.company}
                    </button>
                    <span className="muted">{[c.date, c.round].filter(Boolean).join(' ')}</span>
                  </th>
                  <td>{c.status && <span className={`status-pill ${c.status.tone}`}>{c.status.label}</span>}</td>
                  <td className="num">{c.n} 题</td>
                  <td className="num good-rate">{Math.round((c.good / c.n) * 100)}%</td>
                  <td className="iv-prog">
                    <span className="mini-track" title={`已解决 ${c.resolved} / ${c.n}`}>
                      <span style={{ width: `${(c.resolved / c.n) * 100}%` }} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
    </div>
  );
}
