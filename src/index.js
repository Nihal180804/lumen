import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { EDITION_NAME } from './constants';

// Tag the document so edition-specific CSS (e.g. styles/focus.css) can apply.
document.documentElement.dataset.edition = EDITION_NAME;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
