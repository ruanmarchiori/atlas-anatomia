import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ehApp } from './catalogo';
import App from './ui/App';
import './estilo.css';

// Só em desenvolvimento: expõe estado e ações para os testes automáticos no navegador.
if (import.meta.env.DEV) {
  void Promise.all([import('./estado'), import('./acoes')]).then(([estado, acoes]) => {
    (window as unknown as { __atlas: unknown }).__atlas = { ...estado, ...acoes };
  });
}

// PWA: registra o service worker (guarda o site para uso offline). Não no app Android,
// que já traz tudo dentro, nem em desenvolvimento.
if (import.meta.env.PROD && !ehApp() && 'serviceWorker' in navigator && import.meta.env.MODE !== 'android') {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
