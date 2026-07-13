import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const nativeFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const requestUrl = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  const isApiRequest = requestUrl.startsWith('/api/') || requestUrl.includes('/api/');

  if (!isApiRequest || init?.credentials) {
    return nativeFetch(input, init);
  }

  return nativeFetch(input, {
    ...init,
    credentials: 'include',
  });
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
