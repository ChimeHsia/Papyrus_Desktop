import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from '@arco-design/web-react';
import zhCN from '@arco-design/web-react/es/locale/zh-CN';
import enUS from '@arco-design/web-react/es/locale/en-US';

import '@arco-design/web-react/es/_util/react-19-adapter';
import '@arco-design/web-react/dist/css/arco.css';
import './theme.css';
import './a11y.css';
import './tailwind.css';

import App from './App';
import { AccessibilityProvider } from './contexts/AccessibilityContext';
import { ScreenReaderAnnouncerProvider } from './components/ScreenReaderAnnouncer';
import i18n, { init as i18nInit } from './i18n';

const el = document.getElementById('root');
if (!el) throw new Error('Missing #root');

// 挂载前初始化：暗色模式 + 字体大小，减少首次闪屏
if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.body.setAttribute('arco-theme', 'dark');
}
try {
  const v = localStorage.getItem('papyrus_font_size');
  if (v) document.body.dataset.fontSize = v;
} catch {}

// 监听系统暗色切换，HMR 时自动移除监听
const mq = window.matchMedia('(prefers-color-scheme: dark)');
const onDarkChange = (e: MediaQueryListEvent) => document.body.toggleAttribute('arco-theme', e.matches);
mq.addEventListener('change', onDarkChange);
if (import.meta.hot) import.meta.hot.dispose(() => mq.removeEventListener('change', onDarkChange));

// i18n 就绪后更新 splash 画面提示文字
i18nInit.then(() => {
  const hint = document.querySelector('.splash-screen .hint');
  if (hint) hint.textContent = i18n.t('settings.splashScreen');
}).catch(() => {});

const LOCALE_MAP: Record<string, typeof zhCN> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

// 从 localStorage 读取语言偏好，并同步跨标签页切换
function useLocale() {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('papyrus_language') || 'zh-CN'; } catch { return 'zh-CN'; }
  });
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'papyrus_language') setLang(e.newValue ?? 'zh-CN');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  return lang;
}

function Root() {
  const [ready, setReady] = useState(false);
  const lang = useLocale();

  useEffect(() => { i18nInit.then(() => setReady(true)); }, []);

  if (!ready) return null;

  return (
    <React.StrictMode>
      <ConfigProvider locale={LOCALE_MAP[lang] ?? zhCN}>
        <AccessibilityProvider>
          <ScreenReaderAnnouncerProvider timeout={2000}>
            <App />
          </ScreenReaderAnnouncerProvider>
        </AccessibilityProvider>
      </ConfigProvider>
    </React.StrictMode>
  );
}

createRoot(el).render(<Root />);
