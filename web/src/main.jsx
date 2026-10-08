import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { applyTheme } from './components/Sidebar.jsx';
import './styles.css';

// 渲染前应用已保存的主题，避免闪烁
try { applyTheme(localStorage.getItem('mianjing.theme') || 'system'); } catch { /* ignore */ }

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>,
);
