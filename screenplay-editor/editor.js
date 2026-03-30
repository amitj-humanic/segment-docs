/**
 * Screenplay Editor — Main module
 * A Final Draft-style screenplay editor powered by PretextJS for
 * precise text measurement and page layout.
 */

import { ELEMENTS, FONT, getNextElement } from './screenplay-format.js';
import { initPretext, paginate, measureText, getLayoutMetrics } from './pagination.js';
import { AutocompleteEngine } from './autocomplete.js';
import { parseFountain, toFountain } from './fountain-io.js';

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
  titlePage: {
    title: '',
    author: '',
    draft: '',
    date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    contact: '',
  },
  lines: [
    { type: 'scene-heading', text: '' },
  ],
  activeLine: 0,
  pretextReady: false,
};

const autocomplete = new AutocompleteEngine();

// ─── DOM References ──────────────────────────────────────────────────────────

const editorContainer = document.getElementById('editor-container');
const elementTypeSelect = document.getElementById('element-type');
const shortcutHint = document.getElementById('shortcut-hint');
const pageIndicator = document.getElementById('page-indicator');
const cursorPosition = document.getElementById('cursor-position');
const btnNew = document.getElementById('btn-new');
const btnExport = document.getElementById('btn-export');
const btnImport = document.getElementById('btn-import');
const fileInput = document.getElementById('file-input');

// Title page inputs
const titleInput = document.getElementById('title-input');
const authorInput = document.getElementById('author-input');
const draftInput = document.getElementById('draft-input');
const dateInput = document.getElementById('date-input');
const contactInput = document.getElementById('contact-input');

// ─── Initialization ──────────────────────────────────────────────────────────

async function init() {
  // Initialize PretextJS
  state.pretextReady = await initPretext();

  // Set up title page
  dateInput.value = state.titlePage.date;
  bindTitlePage();

  // Set up toolbar
  bindToolbar();

  // Render initial state
  render();

  // Focus first line
  requestAnimationFrame(() => {
    focusLine(0);
  });

  // Update shortcut hint
  updateShortcutHint();
}

// ─── Title Page Binding ──────────────────────────────────────────────────────

function bindTitlePage() {
  titleInput.addEventListener('input', () => { state.titlePage.title = titleInput.value; });
  authorInput.addEventListener('input', () => { state.titlePage.author = authorInput.value; });
  draftInput.addEventListener('input', () => { state.titlePage.draft = draftInput.value; });
  dateInput.addEventListener('input', () => { state.titlePage.date = dateInput.value; });
  contactInput.addEventListener('input', () => { state.titlePage.contact = contactInput.value; });
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

function bindToolbar() {
  // Element type selector
  elementTypeSelect.addEventListener('change', () => {
    const idx = state.activeLine;
    if (idx >= 0 && idx < state.lines.length) {
      state.lines[idx].type = elementTypeSelect.value;
      render();
      focusLine(idx);
    }
  });

  // New script
  btnNew.addEventListener('click', () => {
    if (confirm('Start a new screenplay? Unsaved changes will be lost.')) {
      state.lines = [{ type: 'scene-heading', text: '' }];
      state.activeLine = 0;
      state.titlePage = { title: '', author: '', draft: '', date: dateInput.value, contact: '' };
      titleInput.value = '';
      authorInput.value = '';
      draftInput.value = '';
      contactInput.value = '';
      render();
      focusLine(0);
    }
  });

  // Export
  btnExport.addEventListener('click', exportScript);

  // Import
  btnImport.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', importScript);
}

function updateShortcutHint() {
  const type = elementTypeSelect.value;
  const el = ELEMENTS[type];
  if (el) {
    shortcutHint.textContent = `Ctrl+${el.shortcut}`;
  }
}

// ─── Rendering ───────────────────────────────────────────────────────────────

let renderScheduled = false;

function scheduleRender() {
  if (!renderScheduled) {
    renderScheduled = true;
    requestAnimationFrame(() => {
      renderScheduled = false;
      render();
    });
  }
}

function render() {
  // Calculate pagination
  const metrics = getLayoutMetrics(state.lines);
  const pages = metrics.pages;

  // Update page indicator
  const activePage = findPageForLine(pages, state.activeLine);
  pageIndicator.textContent = `Page ${activePage} of ${pages.length}`;

  // Clear editor container
  editorContainer.innerHTML = '';

  // Render each page
  for (const page of pages) {
    const pageEl = document.createElement('div');
    pageEl.className = 'script-page';

    // Page number (starting from page 2)
    if (page.pageNumber > 1) {
      const pageNum = document.createElement('div');
      pageNum.className = 'page-number';
      pageNum.textContent = `${page.pageNumber}.`;
      pageEl.appendChild(pageNum);
    }

    // Render elements on this page
    for (const lineIdx of page.elements) {
      const lineData = state.lines[lineIdx];
      if (!lineData) continue;

      const lineEl = createLineElement(lineData, lineIdx);
      pageEl.appendChild(lineEl);
    }

    editorContainer.appendChild(pageEl);
  }
}

function createLineElement(lineData, index) {
  const el = document.createElement('div');
  el.className = 'screenplay-line';
  el.dataset.type = lineData.type;
  el.dataset.index = index;
  el.contentEditable = 'true';
  el.spellcheck = true;

  const elDef = ELEMENTS[lineData.type];
  if (elDef) {
    el.dataset.placeholder = elDef.placeholder;
  }

  // Set text content
  if (lineData.text) {
    el.textContent = lineData.text;
  }

  // Event listeners
  el.addEventListener('input', (e) => onLineInput(e, index));
  el.addEventListener('keydown', (e) => onLineKeydown(e, index));
  el.addEventListener('focus', () => onLineFocus(index));
  el.addEventListener('blur', () => onLineBlur(index));

  return el;
}

// ─── Line Event Handlers ─────────────────────────────────────────────────────

function onLineInput(e, index) {
  const el = e.target;
  state.lines[index].text = el.textContent;

  // Trigger autocomplete for certain element types
  const type = state.lines[index].type;
  if (['scene-heading', 'character', 'transition'].includes(type)) {
    const suggestions = autocomplete.getSuggestions(type, el.textContent);
    if (suggestions.length > 0) {
      autocomplete.show(el, suggestions, (selected) => {
        el.textContent = selected;
        state.lines[index].text = selected;
        placeCaretAtEnd(el);
      });
    } else {
      autocomplete.hide();
    }
  }

  // Debounced re-render for pagination updates
  scheduleRender();
}

function onLineKeydown(e, index) {
  // Let autocomplete handle keys first
  if (autocomplete.handleKey(e)) return;

  // Ctrl+number shortcuts for element types
  if (e.ctrlKey && !e.shiftKey && !e.altKey) {
    for (const [type, def] of Object.entries(ELEMENTS)) {
      if (e.key === def.shortcut) {
        e.preventDefault();
        state.lines[index].type = type;
        elementTypeSelect.value = type;
        updateShortcutHint();
        render();
        focusLine(index);
        return;
      }
    }
  }

  // Enter: create new line
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    autocomplete.hide();

    const currentType = state.lines[index].type;
    const currentText = state.lines[index].text;
    const nextType = getNextElement(currentType, currentText);

    // If current line is empty and it's not the only line, change type instead
    if (!currentText.trim() && state.lines.length > 1) {
      // Cycle through: current -> action (as a "reset")
      if (currentType !== 'action') {
        state.lines[index].type = 'action';
        elementTypeSelect.value = 'action';
        render();
        focusLine(index);
        return;
      }
    }

    // Insert new line after current
    const newLine = { type: nextType, text: '' };
    state.lines.splice(index + 1, 0, newLine);
    state.activeLine = index + 1;

    // Rebuild autocomplete index
    autocomplete.indexScript(state.lines);

    render();
    focusLine(index + 1);
    elementTypeSelect.value = nextType;
    updateShortcutHint();
    return;
  }

  // Backspace at beginning of empty line: delete line and go to previous
  if (e.key === 'Backspace') {
    const el = e.target;
    if (el.textContent === '' && index > 0) {
      e.preventDefault();
      state.lines.splice(index, 1);
      state.activeLine = index - 1;
      render();
      focusLine(index - 1, 'end');
      return;
    }
  }

  // Tab: cycle element type forward
  if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault();
    const types = Object.keys(ELEMENTS);
    const currentIdx = types.indexOf(state.lines[index].type);
    const nextIdx = (currentIdx + 1) % types.length;
    state.lines[index].type = types[nextIdx];
    elementTypeSelect.value = types[nextIdx];
    updateShortcutHint();
    render();
    focusLine(index);
    return;
  }

  // Shift+Tab: cycle element type backward
  if (e.key === 'Tab' && e.shiftKey) {
    e.preventDefault();
    const types = Object.keys(ELEMENTS);
    const currentIdx = types.indexOf(state.lines[index].type);
    const nextIdx = (currentIdx - 1 + types.length) % types.length;
    state.lines[index].type = types[nextIdx];
    elementTypeSelect.value = types[nextIdx];
    updateShortcutHint();
    render();
    focusLine(index);
    return;
  }

  // Arrow Up at first line position: go to previous line
  if (e.key === 'ArrowUp' && index > 0) {
    const sel = window.getSelection();
    if (sel.rangeCount && isCaretAtStart(e.target)) {
      e.preventDefault();
      focusLine(index - 1, 'end');
      return;
    }
  }

  // Arrow Down at last line position: go to next line
  if (e.key === 'ArrowDown' && index < state.lines.length - 1) {
    const sel = window.getSelection();
    if (sel.rangeCount && isCaretAtEnd(e.target)) {
      e.preventDefault();
      focusLine(index + 1, 'start');
      return;
    }
  }
}

function onLineFocus(index) {
  state.activeLine = index;
  const line = state.lines[index];
  if (line) {
    elementTypeSelect.value = line.type;
    updateShortcutHint();
  }
  updateCursorPosition();
}

function onLineBlur(index) {
  autocomplete.hide();

  // Auto-detect element type based on content if type is 'action'
  const line = state.lines[index];
  if (line && line.type === 'action' && line.text.trim()) {
    const detected = detectAutoType(line.text);
    if (detected && detected !== 'action') {
      line.type = detected;
      scheduleRender();
    }
  }
}

/**
 * Simple auto-detection for scene headings and transitions typed as action.
 */
function detectAutoType(text) {
  const trimmed = text.trim();
  if (/^(INT\.|EXT\.|INT\.\/EXT\.|I\/E\.)/i.test(trimmed)) {
    return 'scene-heading';
  }
  if (/^[A-Z\s]+TO:$/.test(trimmed) || /^FADE (OUT\.|IN:)$/.test(trimmed)) {
    return 'transition';
  }
  return null;
}

// ─── Focus & Caret Helpers ───────────────────────────────────────────────────

function focusLine(index, caretPos = 'end') {
  const lineEl = editorContainer.querySelector(`[data-index="${index}"]`);
  if (!lineEl) return;

  lineEl.focus();

  if (caretPos === 'end') {
    placeCaretAtEnd(lineEl);
  } else {
    placeCaretAtStart(lineEl);
  }

  // Scroll into view
  lineEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  updateCursorPosition();
}

function placeCaretAtEnd(el) {
  const range = document.createRange();
  const sel = window.getSelection();
  if (el.childNodes.length > 0) {
    const lastNode = el.childNodes[el.childNodes.length - 1];
    range.setStart(lastNode, lastNode.length || 0);
  } else {
    range.setStart(el, 0);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function placeCaretAtStart(el) {
  const range = document.createRange();
  const sel = window.getSelection();
  range.setStart(el, 0);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function isCaretAtStart(el) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return false;
  const range = sel.getRangeAt(0);
  return range.startOffset === 0 && range.startContainer === el.firstChild || range.startContainer === el;
}

function isCaretAtEnd(el) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return false;
  const range = sel.getRangeAt(0);
  const node = range.endContainer;
  return range.endOffset === (node.length || node.childNodes.length);
}

function updateCursorPosition() {
  const idx = state.activeLine;
  const line = state.lines[idx];
  if (line) {
    cursorPosition.textContent = `Line ${idx + 1} · ${ELEMENTS[line.type]?.label || line.type}`;
  }
}

function findPageForLine(pages, lineIndex) {
  for (const page of pages) {
    if (page.elements.includes(lineIndex)) {
      return page.pageNumber;
    }
  }
  return 1;
}

// ─── Import / Export ─────────────────────────────────────────────────────────

function exportScript() {
  const titlePageData = {
    title: titleInput.value || 'Untitled',
    author: authorInput.value,
    draft: draftInput.value,
    date: dateInput.value,
    contact: contactInput.value,
  };

  const fountain = toFountain(titlePageData, state.lines);
  const blob = new Blob([fountain], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(titleInput.value || 'screenplay').replace(/\s+/g, '_')}.fountain`;
  a.click();
  URL.revokeObjectURL(url);
}

function importScript(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const content = event.target.result;
    const parsed = parseFountain(content);

    // Populate title page
    if (parsed.titlePage.title) {
      titleInput.value = parsed.titlePage.title;
      state.titlePage.title = parsed.titlePage.title;
    }
    if (parsed.titlePage.author) {
      authorInput.value = parsed.titlePage.author;
      state.titlePage.author = parsed.titlePage.author;
    }
    if (parsed.titlePage['draft date']) {
      draftInput.value = parsed.titlePage['draft date'];
      state.titlePage.draft = parsed.titlePage['draft date'];
    }
    if (parsed.titlePage.contact) {
      contactInput.value = parsed.titlePage.contact;
      state.titlePage.contact = parsed.titlePage.contact;
    }

    // Set script lines
    state.lines = parsed.lines.length > 0 ? parsed.lines : [{ type: 'scene-heading', text: '' }];
    state.activeLine = 0;

    // Rebuild autocomplete index
    autocomplete.indexScript(state.lines);

    render();
    focusLine(0);
  };
  reader.readAsText(file);

  // Reset file input so same file can be re-imported
  fileInput.value = '';
}

// ─── Keyboard Shortcuts (Global) ─────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  // Ctrl+S: Export
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    exportScript();
  }

  // Ctrl+O: Import
  if (e.ctrlKey && e.key === 'o') {
    e.preventDefault();
    fileInput.click();
  }

  // Ctrl+N: New
  if (e.ctrlKey && e.key === 'n') {
    e.preventDefault();
    btnNew.click();
  }
});

// ─── Load Sample Script ──────────────────────────────────────────────────────

function loadSampleScript() {
  state.lines = [
    { type: 'scene-heading', text: 'INT. COFFEE SHOP - MORNING' },
    { type: 'action', text: 'A busy coffee shop in downtown Los Angeles. Sunlight streams through floor-to-ceiling windows. ALEX (30s, disheveled but sharp) sits at a corner table, laptop open, three empty cups beside them.' },
    { type: 'character', text: 'ALEX' },
    { type: 'parenthetical', text: '(muttering to screen)' },
    { type: 'dialogue', text: "Come on, come on... just one more line of code and we're done." },
    { type: 'action', text: "JORDAN (late 20s, immaculate, carrying two fresh coffees) slides into the seat across from Alex." },
    { type: 'character', text: 'JORDAN' },
    { type: 'dialogue', text: "You said that three hours ago. And six hours before that." },
    { type: 'character', text: 'ALEX' },
    { type: 'dialogue', text: "This time I mean it. The text measurement algorithm is almost perfect." },
    { type: 'character', text: 'JORDAN' },
    { type: 'parenthetical', text: '(sliding a coffee over)' },
    { type: 'dialogue', text: "Perfect enough to ship?" },
    { type: 'action', text: 'Alex takes the coffee without looking up. Types furiously. Then stops. A slow grin spreads across their face.' },
    { type: 'character', text: 'ALEX' },
    { type: 'dialogue', text: "It works. Every line breaks exactly where it should. Every page is exactly fifty-five lines. It actually works." },
    { type: 'character', text: 'JORDAN' },
    { type: 'parenthetical', text: '(leaning over to look)' },
    { type: 'dialogue', text: "Is that... a screenplay editor?" },
    { type: 'character', text: 'ALEX' },
    { type: 'dialogue', text: "Not just any editor. It uses PretextJS for the layout engine. Sub-millisecond text measurement. Zero DOM reflows. Perfect pagination." },
    { type: 'character', text: 'JORDAN' },
    { type: 'dialogue', text: "You built a screenplay editor... to procrastinate on your actual screenplay?" },
    { type: 'action', text: 'Beat.' },
    { type: 'character', text: 'ALEX' },
    { type: 'dialogue', text: "...I prefer to call it research." },
    { type: 'transition', text: 'CUT TO:' },
    { type: 'scene-heading', text: 'EXT. COFFEE SHOP - CONTINUOUS' },
    { type: 'action', text: 'Through the window, we see Alex animatedly demonstrating the editor to Jordan, who shakes their head but smiles.' },
    { type: 'transition', text: 'FADE OUT.' },
  ];

  titleInput.value = 'THE PERFECT PAGE';
  authorInput.value = 'A. Programmer';
  state.titlePage.title = 'THE PERFECT PAGE';
  state.titlePage.author = 'A. Programmer';

  autocomplete.indexScript(state.lines);
}

// Load sample and start
loadSampleScript();
init();
