import React, { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';

/** Esc 关闭（busy 时不响应） */
export function useEscape(active, onEscape) {
  useEffect(() => {
    if (!active) return;
    const h = (e) => { if (e.key === 'Escape') onEscape?.(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [active, onEscape]);
}

/** 通用弹窗外壳：遮罩点击 / Esc 关闭，打开时聚焦第一个可操作元素 */
export function Modal({ open, title, onClose, busy = false, className = '', children }) {
  const ref = useRef(null);
  useEscape(open && !busy, onClose);
  useEffect(() => {
    if (!open) return;
    const el = ref.current?.querySelector('[data-autofocus], input, textarea, button:not(.modal-close)');
    el?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}>
      <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn modal-close" onClick={onClose} disabled={busy} aria-label="关闭">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** 确认弹窗：danger=true 时确认按钮为警示样式 */
export default function ConfirmDialog({
  open, title, message,
  confirmText = '确认', cancelText = '取消',
  busy = false, danger = false,
  onConfirm, onClose,
}) {
  return (
    <Modal open={open} title={title} onClose={onClose} busy={busy} className="confirm-modal">
      <div className="confirm-msg">{message}</div>
      <div className="modal-actions">
        {/* 危险操作默认聚焦「取消」，避免回车误删 */}
        <button className="btn" disabled={busy} onClick={onClose} data-autofocus={danger || undefined}>
          {cancelText}
        </button>
        <button
          className={`btn ${danger ? 'danger' : 'primary'}`} disabled={busy}
          onClick={onConfirm} data-autofocus={!danger || undefined}
        >
          {busy ? '处理中…' : confirmText}
        </button>
      </div>
    </Modal>
  );
}
