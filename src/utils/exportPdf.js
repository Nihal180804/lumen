import { jsPDF } from 'jspdf';

/* ---------- Resolve the app's *current* theme into a PDF palette ----------
   Reads the live CSS variables so the exported PDF matches whatever theme
   (and light/dark mode) is selected. Translucent values resolve to their
   solid RGB (the PDF has no wallpaper behind it). */
function cssVarRgb(root, name, fallback) {
  const raw = getComputedStyle(root).getPropertyValue(name).trim();
  if (!raw) return fallback;
  const probe = document.createElement('span');
  probe.style.color = raw;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  document.body.removeChild(probe);
  const m = resolved.match(/\d+/g);
  return m && m.length >= 3 ? [Number(m[0]), Number(m[1]), Number(m[2])] : fallback;
}

function themePalette() {
  const root = document.documentElement;
  const v = (n, f) => cssVarRgb(root, n, f);
  return {
    ink:      v('--ink', [59, 51, 42]),
    soft:     v('--ink-soft', [122, 108, 93]),
    faint:    v('--ink-faint', [181, 165, 143]),
    paper:    v('--paper', [251, 246, 236]),
    cardWarm: v('--paper-warm', [244, 234, 214]),
    cardDone: v('--paper-shade', [211, 221, 197]),
    coral:    v('--coral', [224, 133, 96]),
    coralDk:  v('--coral-dark', [184, 89, 58]),
    sage:     v('--sage', [147, 166, 127]),
    butter:   v('--butter', [244, 209, 123]),
    rule:     v('--paper-shade', [220, 210, 192]),
    onAccent: v('--on-accent', [255, 250, 240]),
  };
}

const A4 = { w: 210, h: 297 };
const MARGIN = { x: 22, top: 66, bottom: 22 };

const todayString = () =>
  new Date().toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

const rgb = (doc, kind, arr) => {
  if (kind === 'fill') doc.setFillColor(arr[0], arr[1], arr[2]);
  else doc.setDrawColor(arr[0], arr[1], arr[2]);
};

const hexToRgb = (hex) => {
  const m = (hex || '#3b332a').replace('#', '');
  return [parseInt(m.substr(0, 2), 16), parseInt(m.substr(2, 2), 16), parseInt(m.substr(4, 2), 16)];
};

function wavyLine(doc, x1, x2, y, opts = {}) {
  const amplitude = opts.amplitude ?? 0.6;
  const wavelength = opts.wavelength ?? 3;
  rgb(doc, 'draw', opts.color || [224, 133, 96]);
  doc.setLineWidth(opts.thickness ?? 0.5);
  let x = x1;
  let toggle = 1;
  while (x < x2) {
    const nx = Math.min(x + wavelength, x2);
    doc.line(x, y + amplitude * toggle, nx, y - amplitude * toggle);
    x = nx;
    toggle *= -1;
  }
}

function dottedLine(doc, x1, x2, y, opts = {}) {
  rgb(doc, 'draw', opts.color || [220, 210, 192]);
  doc.setLineWidth(opts.thickness ?? 0.4);
  doc.setLineDashPattern([0.3, 1.2], 0);
  doc.line(x1, y, x2, y);
  doc.setLineDashPattern([], 0);
}

/* ---------- Page chrome (called on every page) ---------- */
function drawPageChrome(doc, { title, subtitle }, P) {
  rgb(doc, 'fill', P.paper);
  doc.rect(0, 0, A4.w, A4.h, 'F');

  rgb(doc, 'fill', P.coral);
  doc.roundedRect(MARGIN.x, 20, A4.w - MARGIN.x * 2, 30, 5, 5, 'F');

  rgb(doc, 'fill', P.butter);
  doc.roundedRect(A4.w / 2 - 22, 14, 44, 12, 1.5, 1.5, 'F');

  doc.setFont('times', 'bolditalic');
  doc.setFontSize(24);
  doc.setTextColor(...P.onAccent);
  doc.text(title, MARGIN.x + 8, 37);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...P.onAccent);
  doc.text(subtitle, MARGIN.x + 8, 45);

  doc.setFont('times', 'italic');
  doc.setFontSize(11);
  doc.setTextColor(...P.onAccent);
  doc.text('~ lumen', A4.w - MARGIN.x - 8, 44, { align: 'right' });

  wavyLine(doc, MARGIN.x, A4.w - MARGIN.x, A4.h - MARGIN.bottom, {
    color: P.faint, thickness: 0.4, wavelength: 3.5, amplitude: 0.7,
  });

  const page = doc.getCurrentPageInfo().pageNumber;
  doc.setFont('times', 'italic');
  doc.setFontSize(10);
  doc.setTextColor(...P.soft);
  doc.text(`~ page ${page} ~`, A4.w / 2, A4.h - MARGIN.bottom + 7, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('made with a little care', MARGIN.x, A4.h - MARGIN.bottom + 7);
}

const ensureRoom = (doc, y, needed, chrome, P) => {
  if (y + needed > A4.h - MARGIN.bottom - 4) {
    doc.addPage();
    drawPageChrome(doc, chrome, P);
    return MARGIN.top;
  }
  return y;
};

/* ===================================================================== */
export function exportTasksToPdf(tasks) {
  const P = themePalette();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const chrome = { title: 'My tasks', subtitle: todayString() };
  drawPageChrome(doc, chrome, P);

  const contentW = A4.w - MARGIN.x * 2;
  let y = MARGIN.top;

  if (tasks.length === 0) {
    doc.setFont('times', 'italic');
    doc.setFontSize(14);
    doc.setTextColor(...P.soft);
    doc.text('nothing yet ~ a blank page is a fresh start', A4.w / 2, y + 20, { align: 'center' });
    doc.save(`tasks-${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }

  const done = tasks.filter((t) => t.completed).length;
  doc.setFont('times', 'italic');
  doc.setFontSize(11);
  doc.setTextColor(...P.soft);
  doc.text(`~ ${done} of ${tasks.length} done ~`, MARGIN.x, y);
  wavyLine(doc, MARGIN.x, MARGIN.x + 56, y + 1.5, { color: P.coral, thickness: 0.6, wavelength: 3, amplitude: 0.5 });
  y += 9;

  for (const task of tasks) {
    const lines = doc.splitTextToSize(task.text, contentW - 26);
    const cardH = Math.max(15, 9 + lines.length * 5.4);
    y = ensureRoom(doc, y, cardH + 4, chrome, P);

    rgb(doc, 'fill', task.completed ? P.cardDone : P.cardWarm);
    doc.roundedRect(MARGIN.x, y, contentW, cardH, 3, 3, 'F');

    doc.setLineDashPattern([0.6, 0.8], 0);
    rgb(doc, 'draw', task.completed ? P.sage : P.faint);
    doc.setLineWidth(0.35);
    doc.roundedRect(MARGIN.x, y, contentW, cardH, 3, 3, 'S');
    doc.setLineDashPattern([], 0);

    const boxX = MARGIN.x + 5;
    const boxY = y + cardH / 2 - 3;
    if (task.completed) {
      rgb(doc, 'fill', P.coral);
      doc.roundedRect(boxX, boxY, 6, 6, 1.4, 1.4, 'F');
      doc.setDrawColor(...P.onAccent);
      doc.setLineWidth(0.95);
      doc.line(boxX + 1.3, boxY + 3.3, boxX + 2.7, boxY + 4.7);
      doc.line(boxX + 2.7, boxY + 4.7, boxX + 4.9, boxY + 1.7);
    } else {
      rgb(doc, 'draw', P.coralDk);
      doc.setLineWidth(0.45);
      doc.roundedRect(boxX, boxY, 6, 6, 1.4, 1.4, 'S');
    }

    doc.setFont(task.completed ? 'times' : 'helvetica', task.completed ? 'italic' : 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...(task.completed ? P.soft : P.ink));
    const textX = boxX + 11;
    const textY = y + 6 + (lines.length === 1 ? 0.9 : 0);
    doc.text(lines, textX, textY);

    if (task.completed && lines.length === 1) {
      const tw = doc.getTextWidth(lines[0]);
      wavyLine(doc, textX, textX + tw, textY - 1.2, { color: P.sage, thickness: 0.5, wavelength: 2.4, amplitude: 0.4 });
    }

    y += cardH + 4;
  }

  doc.save(`tasks-${new Date().toISOString().slice(0, 10)}.pdf`);
}

/* ===================================================================== */
const NOTE_FONT_MAP = {
  caveat:  ['times', 'italic'],
  patrick: ['helvetica', 'normal'],
  shadows: ['times', 'italic'],
  nunito:  ['helvetica', 'normal'],
  serif:   ['times', 'normal'],
  mono:    ['courier', 'normal'],
};
const NOTE_SIZE_MAP = { caveat: 14, patrick: 12, shadows: 13, nunito: 11, serif: 12, mono: 10 };

export function exportNotesToPdf(notes, options = {}) {
  const P = themePalette();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const chrome = { title: 'My notes', subtitle: todayString() };
  drawPageChrome(doc, chrome, P);

  const contentW = A4.w - MARGIN.x * 2;
  let y = MARGIN.top;

  const trimmed = (notes || '').trim();
  if (!trimmed) {
    doc.setFont('times', 'italic');
    doc.setFontSize(14);
    doc.setTextColor(...P.soft);
    doc.text('nothing written yet ~ the page is waiting', A4.w / 2, y + 20, { align: 'center' });
    doc.save(`notes-${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }

  const [fontName, fontStyle] = NOTE_FONT_MAP[options.font] || NOTE_FONT_MAP.nunito;
  const baseSize = NOTE_SIZE_MAP[options.font] || 11;
  // Honour the user's chosen text size (scaled from the on-screen px range).
  const fontSize = options.size ? Math.max(9, Math.min(22, Math.round(options.size * 0.75))) : baseSize;
  // Note ink is the user's pen colour, but keep it readable on the themed paper.
  const textColor = hexToRgb(options.color);
  const lineHeight = Math.max(6, fontSize * 0.6);

  doc.setFont(fontName, fontStyle);
  doc.setFontSize(fontSize);
  doc.setTextColor(...textColor);

  const paragraphs = trimmed.split(/\n{2,}/);
  for (const para of paragraphs) {
    const lines = doc.splitTextToSize(para.replace(/\n/g, ' '), contentW);
    for (const line of lines) {
      y = ensureRoom(doc, y, lineHeight, chrome, P);
      dottedLine(doc, MARGIN.x, A4.w - MARGIN.x, y + 1.6, { color: P.rule });
      doc.setTextColor(...textColor);
      doc.setFont(fontName, fontStyle);
      doc.setFontSize(fontSize);
      doc.text(line, MARGIN.x, y);
      y += lineHeight;
    }
    y += 3;
  }

  doc.save(`notes-${new Date().toISOString().slice(0, 10)}.pdf`);
}
