/* AI 生成 By Peng.Guo */
import ReactDOM from 'react-dom/client';
import 'github-markdown-css/github-markdown.css';
import 'highlight.js/styles/github.css';
import App from './App';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('未找到 #root，无法启动 UI');
}

// Electron 开发态不用 StrictMode：MyWorkPanel/xterm 二次 mount 易在 dispose 后触发 dimensions 异常
ReactDOM.createRoot(rootEl).render(<App />);

// AI 生成 By Peng.Guo：开发态在控制台暴露启动失败，便于 DevTools 排查白屏
window.addEventListener('error', (e) => {
  console.error('[UI] uncaught error:', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[UI] unhandled rejection:', e.reason);
});
