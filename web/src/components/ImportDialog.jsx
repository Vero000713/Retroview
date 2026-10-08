import React, { useRef, useState } from 'react';
import { importInterview } from '../api.js';
import { INTERVIEW_STATUS } from './constants.js';
import { Modal } from './ConfirmDialog.jsx';
import Icon from './Icon.jsx';

const MIN_LEN = 50;

/**
 * 上传新面经弹窗：
 * 填公司/日期/轮次/结果 + 粘贴文本、选择或拖入 .txt/.md 文件
 * → POST /api/import（后端 LLM 分块抽取知识点并写入 store）
 */
export default function ImportDialog({ open, onClose, onImported, onView }) {
  const [form, setForm] = useState({ company: '', date: '', round: '一面', status: '' });
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const len = text.trim().length;
  const estParts = Math.max(1, Math.ceil(len / 6000));
  const missing = !form.company.trim() ? '请填写公司' : len < MIN_LEN ? `面经文本至少 ${MIN_LEN} 字（当前 ${len}）` : '';

  const reset = () => {
    setForm({ company: '', date: '', round: '一面', status: '' });
    setText(''); setFileName(''); setResult(null); setError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const readFile = async (f) => {
    if (!f) return;
    if (!/\.(txt|md)$/i.test(f.name) && !f.type.startsWith('text/')) {
      setError('只支持 .txt / .md 文件，docx 请先另存为 txt');
      return;
    }
    setError('');
    try {
      setText(await f.text());
      setFileName(f.name);
    } catch {
      setError('读取文件失败，请直接粘贴文本');
    }
  };

  const submit = async (e) => {
    e?.preventDefault();
    if (missing || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await importInterview({
        company: form.company.trim(), date: form.date.trim(), round: form.round.trim(),
        status: form.status, text: text.trim(),
      });
      setResult({ added: r.added, parts: r.parts, company: form.company.trim() });
      onImported?.(r);
    } catch (err) {
      setError(err.message || '分析失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title="上传面经" onClose={onClose} busy={busy} className="import-modal">
      {result ? (
        <div className="import-result">
          <div className="ok-icon"><Icon name="check" size={26} strokeWidth={2.4} /></div>
          <p>已从「{result.company}」的面经里整理出 <b>{result.added}</b> 道题，原文分 {result.parts} 段入库，问答助手也能检索到。</p>
          <div className="modal-actions center">
            <button className="btn" onClick={reset}>再传一份</button>
            <button className="btn primary" onClick={() => { onView?.(result.company); reset(); onClose(); }}>查看这场复盘</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field wide">
              <span>公司</span>
              <input value={form.company} placeholder="如：百度" disabled={busy} onChange={set('company')} required />
            </label>
            <label className="field">
              <span>日期</span>
              <input value={form.date} placeholder="如：9.20" disabled={busy} onChange={set('date')} />
            </label>
            <label className="field">
              <span>轮次</span>
              <input value={form.round} placeholder="一面" disabled={busy} onChange={set('round')} />
            </label>
            <label className="field">
              <span>结果</span>
              <select value={form.status} disabled={busy} onChange={set('status')}>
                <option value="">未出结果</option>
                {Object.entries(INTERVIEW_STATUS).map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}
              </select>
            </label>
          </div>

          <div
            className={`dropzone ${dragging ? 'drag' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); readFile(e.dataTransfer.files?.[0]); }}
          >
            <div className="dz-bar">
              <span>面经文本</span>
              <span className="muted">粘贴录音转写，或把 .txt / .md 拖进来</span>
              <input ref={fileRef} type="file" accept=".txt,.md,text/plain" hidden onChange={(e) => readFile(e.target.files?.[0])} />
              <button type="button" className="btn ghost sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                <Icon name="file" size={14} />{fileName || '选择文件'}
              </button>
            </div>
            <textarea
              className="import-textarea"
              value={text} disabled={busy}
              placeholder="面试官：先做个自我介绍吧……"
              onChange={(e) => { setText(e.target.value); setFileName(''); }}
            />
            <div className="import-meta">{len ? `${len} 字，预计分 ${estParts} 段分析` : '尚未输入'}</div>
          </div>

          {error && <div className="notice error" role="alert">{error}</div>}
          {busy && (
            <div className="notice info" role="status">
              <span className="spinner" />正在逐段阅读并整理题目，共约 {estParts} 段，通常需要 1–3 分钟，请保持页面打开。
            </div>
          )}

          <div className="modal-actions">
            {!busy && missing && <span className="muted hint">{missing}</span>}
            <button type="button" className="btn" disabled={busy} onClick={onClose}>取消</button>
            <button type="submit" className="btn primary" disabled={!!missing || busy}>
              {busy ? '分析中…' : '分析并入库'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
