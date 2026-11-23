import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './style.css';

createRoot(document.getElementById('root')!).render(<HashRouter><App/></HashRouter>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load',()=>void navigator.serviceWorker.register(new URL('sw.js',document.baseURI)).catch(console.error));
}
