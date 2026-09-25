import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'ol/ol.css';
import './style.css';
import { PhotoMapApp } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('画面を初期化できません。');
createRoot(root).render(
  <StrictMode>
    <PhotoMapApp />
  </StrictMode>,
);
