import React from 'react';
import ReactDOM from 'react-dom/client';
import { createLogger } from '@/utils/logger';

// i18n 初始化（必须在其他组件之前导入）
import '../i18n';

import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import '../design/shared-tokens.css';
import '../design/app-shell.css';
import { initTheme } from '../utils/theme';

const log = createLogger('Workspace');

log.info('[Workspace] App starting...');

// 初始化主题（在渲染前应用，避免闪烁）
initTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
