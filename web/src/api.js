/** 统一请求：非 2xx 或网络失败时抛出带可读信息的 Error */
async function req(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, {
      ...opts,
      headers: opts.body ? { 'Content-Type': 'application/json', ...opts.headers } : opts.headers,
    });
  } catch {
    throw new Error('连不上后端服务，请确认 server 已在 3001 端口启动');
  }
  let data = null;
  try { data = await res.json(); } catch { /* 无响应体 */ }
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.message || `请求失败（${res.status}）`);
  }
  return data;
}

const json = (body) => JSON.stringify(body);
const enc = encodeURIComponent;

export const fetchStats = () => req('/api/stats');

export const fetchAllItems = () => req('/api/items').then((d) => d.items);

/** 批量删除题目，返回 { removed, stats } */
export const deleteItems = (ids) => req('/api/items', { method: 'DELETE', body: json({ ids }) });

/** 上传新面经：后端 LLM 分块抽取后入库，返回 { added, parts, stats } */
export const importInterview = ({ company, round, date, status, text }) =>
  req('/api/import', { method: 'POST', body: json({ company, round, date, status, text }) });

/** 设置单场面试结果状态（通过/泡池子/挂），空 status 清除标记 */
export const setInterviewStatus = (company, status) =>
  req(`/api/interviews/${enc(company)}/status`, { method: 'POST', body: json({ status }) });

/** 红旗标记切换：返回 { ok, flagged } */
export const toggleFlag = (id) => req(`/api/items/${enc(id)}/flag`, { method: 'POST' });

/** 已解决标记切换：返回 { ok, resolved } */
export const toggleResolve = (id) => req(`/api/items/${enc(id)}/resolve`, { method: 'POST' });

/** 删除整场面试（该公司的题目与原文切片），返回 { removed, stats } */
export const deleteInterview = (company) => req(`/api/interviews/${enc(company)}`, { method: 'DELETE' });

/** SSE 流式问答；signal 可用于中途停止生成 */
export async function chatStream({ message, history, signal }, handlers) {
  let res;
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json({ message, history }),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('连不上后端服务，请确认 server 已在 3001 端口启动');
  }
  if (!res.ok || !res.body) throw new Error(`请求失败（${res.status}）`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop();
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data:')) continue;
      try {
        const evt = JSON.parse(line.slice(5).trim());
        if (evt.type === 'token') handlers.onToken?.(evt.content);
        else if (evt.type === 'refs') handlers.onRefs?.(evt.refs);
        else if (evt.type === 'error') handlers.onError?.(evt.message);
      } catch {
        // 忽略解析失败的分包
      }
    }
  }
}

/** 保存订正笔记（空字符串清除），返回 { ok, note } */
export const saveNote = (id, note) =>
  req(`/api/items/${enc(id)}/note`, { method: 'POST', body: json({ note }) });
