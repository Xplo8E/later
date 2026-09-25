import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import App from './App';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
if (import.meta.env.DEV && location.pathname === '/__review') {
  import('./dev/ViewportLab').then(({ default: ViewportLab }) => root.render(<ViewportLab />));
} else {
  root.render(<StrictMode><App /></StrictMode>);
}

if (import.meta.env.PROD && 'serviceWorker' in navigator && isSecureContext) {
  function register() {
    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch(() => {
        // The website remains usable if installation is unavailable.
      });
  }
  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}
