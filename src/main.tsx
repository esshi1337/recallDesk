import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
import './mobile.css';
createRoot(document.getElementById('root')!).render(<App />);

if (import.meta.env.MODE === 'browser' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Offline cache unavailable:', error)); });
}
