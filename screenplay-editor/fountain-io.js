/**
 * Fountain format (.fountain) import and export.
 * Fountain is the plain-text markup language for screenwriting.
 * See: https://fountain.io/syntax
 */

import { detectElementType } from './screenplay-format.js';

/**
 * Parse a Fountain-formatted string into script lines.
 * Returns { titlePage: object, lines: Array<{type, text}> }
 */
export function parseFountain(source) {
  const titlePage = {};
  let body = source;

  // Extract title page (key: value pairs at the top, separated by blank line)
  const titleMatch = source.match(/^((?:[A-Za-z ]+:.+\n?)+)\n\n/);
  if (titleMatch) {
    const titleBlock = titleMatch[1];
    body = source.slice(titleMatch[0].length);

    for (const line of titleBlock.split('\n')) {
      const kv = line.match(/^([A-Za-z ]+):\s*(.*)$/);
      if (kv) {
        titlePage[kv[1].trim().toLowerCase()] = kv[2].trim();
      }
    }
  }

  const rawLines = body.split('\n');
  const lines = [];
  let i = 0;

  while (i < rawLines.length) {
    const raw = rawLines[i];
    const trimmed = raw.trim();

    // Skip empty lines (they're just spacing)
    if (!trimmed) {
      i++;
      continue;
    }

    // Forced scene heading: line starts with .
    if (trimmed.startsWith('.') && !trimmed.startsWith('..')) {
      lines.push({ type: 'scene-heading', text: trimmed.slice(1).trim() });
      i++;
      continue;
    }

    // Forced transition: line starts with >
    if (trimmed.startsWith('>') && !trimmed.endsWith('<')) {
      lines.push({ type: 'transition', text: trimmed.slice(1).trim() });
      i++;
      continue;
    }

    // Centered text: >text<  (we treat as action)
    if (trimmed.startsWith('>') && trimmed.endsWith('<')) {
      lines.push({ type: 'action', text: trimmed.slice(1, -1).trim() });
      i++;
      continue;
    }

    // Forced character: line starts with @
    if (trimmed.startsWith('@')) {
      lines.push({ type: 'character', text: trimmed.slice(1).trim() });
      i++;
      // Collect dialogue/parenthetical lines that follow
      i = collectDialogueBlock(rawLines, i, lines);
      continue;
    }

    // Scene heading: auto-detect INT./EXT. etc.
    if (/^(INT\.|EXT\.|INT\.\/EXT\.|I\/E\.|EST\.)/i.test(trimmed)) {
      lines.push({ type: 'scene-heading', text: trimmed });
      i++;
      continue;
    }

    // Transition: all caps ending in TO: or specific transitions
    if (/^[A-Z\s]+TO:$/.test(trimmed) || /^FADE (OUT\.|IN:)$/.test(trimmed)) {
      // Must be preceded by an empty line (check if previous raw line was empty)
      if (i === 0 || !rawLines[i - 1].trim()) {
        lines.push({ type: 'transition', text: trimmed });
        i++;
        continue;
      }
    }

    // Character: ALL CAPS line preceded by empty line, followed by non-empty
    if (/^[A-Z][A-Z0-9\s.()\-']+$/.test(trimmed) && trimmed.length < 50) {
      const prevEmpty = i === 0 || !rawLines[i - 1].trim();
      const nextExists = i + 1 < rawLines.length && rawLines[i + 1].trim();
      if (prevEmpty && nextExists) {
        lines.push({ type: 'character', text: trimmed });
        i++;
        // Collect dialogue block
        i = collectDialogueBlock(rawLines, i, lines);
        continue;
      }
    }

    // Parenthetical
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      lines.push({ type: 'parenthetical', text: trimmed });
      i++;
      continue;
    }

    // Default: action
    // Collect multi-line action paragraphs
    let actionText = trimmed;
    i++;
    while (i < rawLines.length && rawLines[i].trim()) {
      actionText += ' ' + rawLines[i].trim();
      i++;
    }
    lines.push({ type: 'action', text: actionText });
  }

  return { titlePage, lines };
}

/**
 * Collect dialogue and parenthetical lines following a character name.
 */
function collectDialogueBlock(rawLines, startIndex, lines) {
  let i = startIndex;
  while (i < rawLines.length && rawLines[i].trim()) {
    const trimmed = rawLines[i].trim();
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      lines.push({ type: 'parenthetical', text: trimmed });
    } else {
      lines.push({ type: 'dialogue', text: trimmed });
    }
    i++;
  }
  return i;
}

/**
 * Export script lines to Fountain format.
 */
export function toFountain(titlePage, lines) {
  let output = '';

  // Title page
  if (titlePage.title) output += `Title: ${titlePage.title}\n`;
  if (titlePage.author) output += `Author: ${titlePage.author}\n`;
  if (titlePage.draft) output += `Draft date: ${titlePage.draft}\n`;
  if (titlePage.date) output += `Date: ${titlePage.date}\n`;
  if (titlePage.contact) output += `Contact: ${titlePage.contact}\n`;

  if (output) output += '\n\n';

  let prevType = null;

  for (const line of lines) {
    const text = line.text || '';

    switch (line.type) {
      case 'scene-heading':
        // Add blank line before scene heading (unless first element)
        if (prevType !== null) output += '\n';
        // If it doesn't start with INT/EXT, force with .
        if (/^(INT\.|EXT\.|INT\.\/EXT\.|I\/E\.)/i.test(text)) {
          output += text.toUpperCase() + '\n';
        } else {
          output += '.' + text.toUpperCase() + '\n';
        }
        break;

      case 'action':
        if (prevType !== null && prevType !== 'action') output += '\n';
        output += text + '\n';
        break;

      case 'character':
        output += '\n';
        output += text.toUpperCase() + '\n';
        break;

      case 'parenthetical':
        // Ensure wrapped in parens
        if (text.startsWith('(')) {
          output += text + '\n';
        } else {
          output += `(${text})` + '\n';
        }
        break;

      case 'dialogue':
        output += text + '\n';
        break;

      case 'transition':
        output += '\n';
        if (/TO:$/.test(text) || /^FADE/.test(text)) {
          output += text.toUpperCase() + '\n';
        } else {
          output += '>' + text.toUpperCase() + '\n';
        }
        break;

      default:
        output += text + '\n';
    }

    prevType = line.type;
  }

  return output;
}
