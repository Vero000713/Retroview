import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

/** 轻提示：替代 alert；支持带一个操作按钮（如「撤销」） */
const ToastCtx = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  const dismiss = useCallback((id) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const toast = useCallback((message, { tone = 'info', action, duration = 2600 } = {}) => {
    const id = ++seq.current;
    setToasts((ts) => [...ts.slice(-2), { id, message, tone, action }]);
    setTimeout(() => dismiss(id), action ? duration + 2400 : duration);
  }, [dismiss]);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <span>{t.message}</span>
            {t.action && (
              <button onClick={() => { t.action.onClick(); dismiss(t.id); }}>{t.action.label}</button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
