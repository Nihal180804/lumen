// Available themes. The actual colors live in tokens.css under
// :root[data-theme="…"]; `preview` here is just for the little swatch shown in
// the theme picker. `key` maps to the data-theme attribute ('paper' = default).
export const THEMES = [
  { key: 'paper',    label: 'Paper',        preview: { bg: '#fbf6ec', accent: '#e08560', ink: '#3b332a' } },
  { key: 'glass',    label: 'Glassmorphism', preview: { bg: '#2a2d38', accent: '#7aa2ff', ink: '#f2f3f7' } },
  { key: 'midnight', label: 'Midnight',     preview: { bg: '#232530', accent: '#e8925f', ink: '#e8e6f0' } },
  { key: 'sakura',   label: 'Sakura',       preview: { bg: '#fdf2f4', accent: '#e0729a', ink: '#4a3a42' } },
  { key: 'forest',   label: 'Forest',       preview: { bg: '#f2f4ea', accent: '#6f8f5c', ink: '#34402e' } },
];

export const DEFAULT_THEME = 'paper';
