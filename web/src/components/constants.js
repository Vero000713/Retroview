/** 全局常量（分类/掌握度元信息），API 返回的 categories 会覆盖标签和说明，颜色仍用本地色板 */
const CAT_COLORS = {
  agent: '#6650c8',
  frontend_framework: '#1d7fa6',
  frontend_basic: '#2e8b6e',
  frontend_engineering: '#b5741c',
  cs_fundamentals: '#b84a6a',
  backend: '#9c4a2f',
  algorithm: '#4f62b8',
  project_scenario: '#6b7280',
};

export let CATEGORIES = [
  { id: 'agent', label: 'Agent / AI', desc: '大模型、提示词、Agent 架构、RAG、数字员工' },
  { id: 'frontend_framework', label: '前端 · Vue/React', desc: '框架原理、diff、响应式、hooks、状态管理' },
  { id: 'frontend_basic', label: '前端 · HTML/CSS/JS', desc: '语言基础、闭包、事件循环、防抖节流、浏览器' },
  { id: 'frontend_engineering', label: '前端 · 工程化', desc: 'webpack/vite、微前端、构建、性能优化' },
  { id: 'cs_fundamentals', label: '计算机基础', desc: '计算机网络（HTTP/HTTPS、SSE/WebSocket）、操作系统、URL 全流程' },
  { id: 'backend', label: '后端开发', desc: 'Node、Java、中间件、数据库、后端模块设计' },
  { id: 'algorithm', label: '算法 / 力扣', desc: '链表、LRU、手写题' },
  { id: 'project_scenario', label: '项目 / 场景', desc: '项目深挖、需求分析、线上排查、软性场景题' },
].map((c) => ({ ...c, color: CAT_COLORS[c.id] }));

export const QMETA = {
  good: { label: '答得不错', short: '不错', color: 'var(--good)' },
  partial: { label: '答得欠缺', short: '欠缺', color: 'var(--partial)' },
  poor: { label: '没答上来', short: '没答上', color: 'var(--poor)' },
};

/** 单场面试结果状态 */
export const INTERVIEW_STATUS = {
  pass: { label: '通过', tone: 'good' },
  pool: { label: '泡池子', tone: 'partial' },
  fail: { label: '挂', tone: 'poor' },
};

export let CAT_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export function setCategories(list) {
  if (Array.isArray(list) && list.length) {
    CATEGORIES = list.map((c) => ({ ...c, color: CAT_COLORS[c.id] || c.color || '#6b7280' }));
    CAT_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
  }
}

/** 兜底分类信息，防止后端出现未登记的分类时渲染崩溃 */
export const catOf = (id) => CAT_MAP[id] || { id, label: id, color: '#6b7280' };

/** 轮次形如「9.11 一面」：拆成 { date, round } */
export function splitRound(round) {
  const m = String(round || '').match(/^(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)\s*(.*)$/);
  return m ? { date: m[1], round: m[2] || '面试' } : { date: '', round: round || '面试' };
}

/* ===== hash 路由：刷新/前进后退都能保持当前视图 ===== */
export function viewFromHash(hash = window.location.hash) {
  const [kind, ...rest] = hash.replace(/^#\/?/, '').split('/');
  const arg = decodeURIComponent(rest.join('/'));
  if (kind === 'all') return { type: 'overview' };
  if (kind === 'chat') return { type: 'chat' };
  if (kind === 'cat' && arg) return { type: 'category', id: arg };
  if (kind === 'iv' && arg) return { type: 'interview', company: arg };
  return { type: 'home' };
}
export function hashFromView(v) {
  if (v.type === 'overview') return '#/all';
  if (v.type === 'chat') return '#/chat';
  if (v.type === 'category') return `#/cat/${encodeURIComponent(v.id)}`;
  if (v.type === 'interview') return `#/iv/${encodeURIComponent(v.company)}`;
  return '#/';
}
export const viewKey = (v) => hashFromView(v);

/** 问题相似度聚类，找高频考点 */
export function findFreqGroups(items, minCount = 2, limit = 10) {
  const toks = items.map((it) => tokenize(it.question));
  const used = new Array(items.length).fill(false);
  const groups = [];
  for (let i = 0; i < items.length; i++) {
    if (used[i]) continue;
    const g = [i];
    used[i] = true;
    for (let j = i + 1; j < items.length; j++) {
      if (!used[j] && jaccard(toks[i], toks[j]) > 0.42) { g.push(j); used[j] = true; }
    }
    if (g.length >= minCount) groups.push(g);
  }
  groups.sort((a, b) => b.length - a.length);
  return groups.slice(0, limit).map((g) => g.map((i) => items[i]));
}

function tokenize(s) {
  const clean = (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
  const set = new Set();
  for (const p of clean.split(/\s+/).filter(Boolean)) {
    if (/^[a-z]+$/.test(p) && p.length > 1) set.add(p);
    else for (let i = 0; i < p.length - 1; i++) set.add(p.slice(i, i + 2));
  }
  return set;
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
