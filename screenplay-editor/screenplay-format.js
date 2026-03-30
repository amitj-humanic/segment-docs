/**
 * Screenplay formatting rules following industry standard (Final Draft compatible).
 * All measurements in points (1 inch = 72pt) based on US Letter (8.5" x 11").
 *
 * Page: 8.5" x 11" (612pt x 792pt)
 * Font: Courier 12pt (fixed-width, ~10 chars/inch)
 * Approx 55 lines of text per page.
 */

// Page dimensions in points
export const PAGE = {
  WIDTH: 612,       // 8.5in
  HEIGHT: 792,      // 11in
  TOP_MARGIN: 72,   // 1in
  BOTTOM_MARGIN: 54,// 0.75in
  LEFT_MARGIN: 108, // 1.5in
  RIGHT_MARGIN: 72, // 1in
};

// Usable text area
export const TEXT_AREA = {
  WIDTH: PAGE.WIDTH - PAGE.LEFT_MARGIN - PAGE.RIGHT_MARGIN, // 432pt = 6in
  HEIGHT: PAGE.HEIGHT - PAGE.TOP_MARGIN - PAGE.BOTTOM_MARGIN, // 666pt = 9.25in
};

// Font
export const FONT = {
  FAMILY: '"Courier New", Courier, monospace',
  SIZE: 12,           // 12pt
  LINE_HEIGHT: 12,    // single-spaced = 12pt per line (industry standard)
  CSS: '12pt "Courier New", Courier, monospace',
};

// Approximate lines per page
export const LINES_PER_PAGE = Math.floor(TEXT_AREA.HEIGHT / FONT.LINE_HEIGHT); // ~55

/**
 * Element type definitions with formatting rules.
 * leftIndent and rightLimit are relative to the text area (0 = left edge of text area).
 * All values in points.
 */
export const ELEMENTS = {
  'scene-heading': {
    label: 'Scene Heading',
    shortcut: '1',
    leftIndent: 0,
    textWidth: TEXT_AREA.WIDTH,  // full width
    spaceBefore: 24, // 2 lines
    spaceAfter: 12,  // 1 line
    uppercase: true,
    bold: true,
    nextElement: 'action',
    placeholder: 'INT./EXT. LOCATION - TIME OF DAY',
    prefixes: ['INT.', 'EXT.', 'INT./EXT.', 'I/E.'],
  },
  'action': {
    label: 'Action',
    shortcut: '2',
    leftIndent: 0,
    textWidth: TEXT_AREA.WIDTH,
    spaceBefore: 0,
    spaceAfter: 12,
    uppercase: false,
    bold: false,
    nextElement: 'action',
    placeholder: 'Describe the action...',
    prefixes: [],
  },
  'character': {
    label: 'Character',
    shortcut: '3',
    leftIndent: 158, // ~2.2in from text area left
    textWidth: 274,  // ~3.8in
    spaceBefore: 12,
    spaceAfter: 0,
    uppercase: true,
    bold: false,
    nextElement: 'dialogue',
    placeholder: 'CHARACTER NAME',
    prefixes: [],
  },
  'dialogue': {
    label: 'Dialogue',
    shortcut: '4',
    leftIndent: 72,  // ~1in from text area left
    textWidth: 252,  // ~3.5in
    spaceBefore: 0,
    spaceAfter: 0,
    uppercase: false,
    bold: false,
    nextElement: 'character',
    placeholder: 'Dialogue text...',
    prefixes: [],
  },
  'parenthetical': {
    label: 'Parenthetical',
    shortcut: '5',
    leftIndent: 115, // ~1.6in from text area left
    textWidth: 180,  // ~2.5in
    spaceBefore: 0,
    spaceAfter: 0,
    uppercase: false,
    bold: false,
    nextElement: 'dialogue',
    placeholder: '(how they say it)',
    prefixes: ['('],
  },
  'transition': {
    label: 'Transition',
    shortcut: '6',
    leftIndent: 0,
    textWidth: TEXT_AREA.WIDTH,
    spaceBefore: 12,
    spaceAfter: 12,
    uppercase: true,
    bold: false,
    align: 'right',
    nextElement: 'scene-heading',
    placeholder: 'CUT TO:',
    prefixes: ['CUT TO:', 'FADE TO:', 'DISSOLVE TO:', 'SMASH CUT TO:', 'FADE OUT.', 'FADE IN:'],
  },
};

/**
 * Determine the next element type based on the current element and Enter key press.
 */
export function getNextElement(currentType, text) {
  const el = ELEMENTS[currentType];
  if (!el) return 'action';

  // After character, if text is empty go to action, otherwise dialogue
  if (currentType === 'character') {
    return text.trim() ? 'dialogue' : 'action';
  }

  // After dialogue, pressing enter goes to action (double-enter) or stays character for next beat
  if (currentType === 'dialogue') {
    return text.trim() ? 'action' : 'action';
  }

  // After parenthetical, go to dialogue
  if (currentType === 'parenthetical') {
    return 'dialogue';
  }

  return el.nextElement || 'action';
}

/**
 * Auto-detect element type from text content (for Fountain import).
 */
export function detectElementType(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Scene heading: starts with INT., EXT., etc.
  if (/^(INT\.|EXT\.|INT\.\/EXT\.|I\/E\.)/.test(trimmed.toUpperCase())) {
    return 'scene-heading';
  }

  // Transition: ends with "TO:" or is "FADE OUT." / "FADE IN:"
  if (/^[A-Z\s]+TO:$/.test(trimmed) || /^FADE (OUT\.|IN:)$/.test(trimmed)) {
    return 'transition';
  }

  // Character: all uppercase, no lowercase letters, not a scene heading or transition
  if (/^[A-Z][A-Z0-9\s.()\-]+$/.test(trimmed) && trimmed.length < 40) {
    return 'character';
  }

  // Parenthetical: wrapped in parens
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    return 'parenthetical';
  }

  return 'action';
}

/**
 * Get CSS font string for a given element type.
 */
export function getFontForElement(type) {
  const el = ELEMENTS[type];
  if (el && el.bold) {
    return `bold ${FONT.CSS}`;
  }
  return FONT.CSS;
}

/**
 * Get the text width (in pixels at screen resolution) for an element type.
 * Converts from points to CSS pixels (1:1 on screen).
 */
export function getTextWidthForElement(type) {
  const el = ELEMENTS[type];
  return el ? el.textWidth : TEXT_AREA.WIDTH;
}
