import { IS_FOCUS } from './constants';

// Cozy editions (full/lite): the decorative, warm themes.
const COZY_THEMES = [
  { key: 'paper',    label: 'Paper',        preview: { bg: '#fbf6ec', accent: '#e08560', ink: '#3b332a' } },
  { key: 'glass',    label: 'Glassmorphism', preview: { bg: '#2a2d38', accent: '#7aa2ff', ink: '#f2f3f7' } },
  { key: 'midnight', label: 'Midnight',     preview: { bg: '#232530', accent: '#e8925f', ink: '#e8e6f0' } },
  { key: 'sakura',   label: 'Sakura',       preview: { bg: '#fdf2f4', accent: '#e0729a', ink: '#4a3a42' } },
  { key: 'forest',   label: 'Forest',       preview: { bg: '#f2f4ea', accent: '#6f8f5c', ink: '#34402e' } },
];

// Focus edition: clean dual-tone themes — a neutral base + one confident accent,
// nothing decorative. Colors live in focus.css under :root[data-theme="…"].
const FOCUS_THEMES = [
  { key: 'voyage',   label: 'Voyage',   preview: { bg: '#1f1e1b', accent: '#d97757', ink: '#f5f1e8' } },
  { key: 'graphite', label: 'Graphite', preview: { bg: '#16181d', accent: '#7c8cff', ink: '#e8ecf3' } },
  { key: 'slate',    label: 'Slate',    preview: { bg: '#0f1417', accent: '#35e0d0', ink: '#e6eef0' } },
  { key: 'black',    label: 'Black',    preview: { bg: '#0a0a0a', accent: '#c6f24e', ink: '#ededed' } },
  { key: 'cream',    label: 'Cream',    preview: { bg: '#f6f4ef', accent: '#1c1e24', ink: '#1c1e24' } },
];

export const THEMES = IS_FOCUS ? FOCUS_THEMES : COZY_THEMES;
export const DEFAULT_THEME = IS_FOCUS ? 'voyage' : 'paper';
