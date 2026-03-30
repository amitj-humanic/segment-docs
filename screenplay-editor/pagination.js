/**
 * Pagination engine using PretextJS for precise text measurement.
 * Calculates page breaks following screenplay rules:
 * - Never orphan a character name at the bottom of a page
 * - Keep parentheticals with their dialogue
 * - Scene headings must have at least one action line following on same page
 * - "(MORE)" and "(CONT'D)" indicators for split dialogue
 */

import { FONT, LINES_PER_PAGE, TEXT_AREA, ELEMENTS, getFontForElement, getTextWidthForElement } from './screenplay-format.js';

// PretextJS will be loaded dynamically
let pretextModule = null;

/**
 * Initialize PretextJS. Falls back to a simple estimator if unavailable.
 */
export async function initPretext() {
  try {
    pretextModule = await import('https://esm.sh/@chenglou/pretext');
    console.log('PretextJS loaded successfully');
    return true;
  } catch (e) {
    console.warn('PretextJS not available, using fallback measurement:', e.message);
    return false;
  }
}

/**
 * Measure text height using PretextJS (or fallback).
 * Returns { height, lineCount }.
 */
export function measureText(text, elementType) {
  if (!text || !text.trim()) {
    return { height: FONT.LINE_HEIGHT, lineCount: 1 };
  }

  const font = getFontForElement(elementType);
  const maxWidth = getTextWidthForElement(elementType);

  if (pretextModule) {
    try {
      const prepared = pretextModule.prepare(text, font);
      const result = pretextModule.layout(prepared, maxWidth, FONT.LINE_HEIGHT);
      return {
        height: result.height,
        lineCount: result.lineCount,
      };
    } catch (e) {
      console.warn('PretextJS measurement failed, using fallback:', e.message);
    }
  }

  // Fallback: estimate using character width
  return fallbackMeasure(text, maxWidth);
}

/**
 * Get wrapped lines using PretextJS (for rendering precision).
 * Returns array of { text, width } objects.
 */
export function getWrappedLines(text, elementType) {
  if (!text || !text.trim()) {
    return [{ text: '', width: 0 }];
  }

  const font = getFontForElement(elementType);
  const maxWidth = getTextWidthForElement(elementType);

  if (pretextModule && pretextModule.prepareWithSegments && pretextModule.layoutWithLines) {
    try {
      const prepared = pretextModule.prepareWithSegments(text, font);
      const result = pretextModule.layoutWithLines(prepared, maxWidth, FONT.LINE_HEIGHT);
      return result.lines;
    } catch (e) {
      console.warn('PretextJS line layout failed:', e.message);
    }
  }

  // Fallback
  return fallbackGetLines(text, maxWidth);
}

/**
 * Fallback measurement using monospace character width estimation.
 * Courier 12pt = ~7.2pt per character.
 */
const CHAR_WIDTH = 7.2; // approximate width of one Courier 12pt character

function fallbackMeasure(text, maxWidth) {
  const charsPerLine = Math.floor(maxWidth / CHAR_WIDTH);
  if (charsPerLine <= 0) return { height: FONT.LINE_HEIGHT, lineCount: 1 };

  const words = text.split(/\s+/);
  let lineCount = 1;
  let currentLineLength = 0;

  for (const word of words) {
    if (currentLineLength + word.length + (currentLineLength > 0 ? 1 : 0) > charsPerLine) {
      lineCount++;
      currentLineLength = word.length;
    } else {
      currentLineLength += (currentLineLength > 0 ? 1 : 0) + word.length;
    }
  }

  return {
    height: lineCount * FONT.LINE_HEIGHT,
    lineCount,
  };
}

function fallbackGetLines(text, maxWidth) {
  const charsPerLine = Math.floor(maxWidth / CHAR_WIDTH);
  if (charsPerLine <= 0) return [{ text, width: 0 }];

  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + (currentLine.length > 0 ? 1 : 0) > charsPerLine) {
      lines.push({ text: currentLine, width: currentLine.length * CHAR_WIDTH });
      currentLine = word;
    } else {
      currentLine += (currentLine.length > 0 ? ' ' : '') + word;
    }
  }
  if (currentLine) {
    lines.push({ text: currentLine, width: currentLine.length * CHAR_WIDTH });
  }

  return lines.length ? lines : [{ text: '', width: 0 }];
}

/**
 * A script element with its measured dimensions.
 */
class MeasuredElement {
  constructor(lineData, index) {
    this.index = index;
    this.type = lineData.type;
    this.text = lineData.text;
    const el = ELEMENTS[this.type] || ELEMENTS['action'];
    this.spaceBefore = el.spaceBefore;
    this.spaceAfter = el.spaceAfter;

    const measurement = measureText(this.text, this.type);
    this.textHeight = measurement.height;
    this.lineCount = measurement.lineCount;
    // Total height includes spacing
    this.totalHeight = this.spaceBefore + this.textHeight + this.spaceAfter;
  }
}

/**
 * Calculate page breaks for the entire script.
 * Returns an array of pages, each containing element indices.
 *
 * @param {Array<{type: string, text: string}>} lines - All script lines
 * @returns {Array<{elements: number[], pageNumber: number}>}
 */
export function paginate(lines) {
  if (!lines || lines.length === 0) {
    return [{ elements: [], pageNumber: 1 }];
  }

  // Measure all elements
  const measured = lines.map((line, i) => new MeasuredElement(line, i));

  const pages = [];
  let currentPage = { elements: [], pageNumber: 1 };
  let remainingHeight = TEXT_AREA.HEIGHT;

  for (let i = 0; i < measured.length; i++) {
    const el = measured[i];
    const heightNeeded = el.totalHeight;

    // Check if element fits on current page
    if (remainingHeight >= heightNeeded || currentPage.elements.length === 0) {
      currentPage.elements.push(el.index);
      remainingHeight -= heightNeeded;
    } else {
      // Need a page break - apply screenplay rules
      const breakResult = applyBreakRules(measured, i, currentPage, remainingHeight);

      if (breakResult.moveBack > 0) {
        // Move some elements to the next page
        const movedIndices = currentPage.elements.splice(-breakResult.moveBack);
        pages.push(currentPage);

        currentPage = {
          elements: [...movedIndices, el.index],
          pageNumber: pages.length + 1,
        };
        // Recalculate remaining height
        remainingHeight = TEXT_AREA.HEIGHT;
        for (const idx of currentPage.elements) {
          remainingHeight -= measured[idx].totalHeight;
        }
      } else {
        pages.push(currentPage);
        currentPage = {
          elements: [el.index],
          pageNumber: pages.length + 1,
        };
        remainingHeight = TEXT_AREA.HEIGHT - heightNeeded;
      }
    }
  }

  if (currentPage.elements.length > 0) {
    pages.push(currentPage);
  }

  return pages.length > 0 ? pages : [{ elements: [], pageNumber: 1 }];
}

/**
 * Apply screenplay-specific page break rules.
 * Returns { moveBack: number } indicating how many elements to move to next page.
 */
function applyBreakRules(measured, currentIndex, currentPage, remainingHeight) {
  const currentEl = measured[currentIndex];
  const pageElements = currentPage.elements;

  if (pageElements.length === 0) return { moveBack: 0 };

  const lastIdx = pageElements[pageElements.length - 1];
  const lastEl = measured[lastIdx];

  // Rule 1: Never orphan a character name - move it to next page
  if (lastEl.type === 'character') {
    return { moveBack: 1 };
  }

  // Rule 2: Keep parenthetical with its character
  if (lastEl.type === 'parenthetical' && pageElements.length >= 2) {
    const secondLastIdx = pageElements[pageElements.length - 2];
    if (measured[secondLastIdx].type === 'character') {
      return { moveBack: 2 };
    }
    return { moveBack: 1 };
  }

  // Rule 3: Scene heading must have at least one following element on the same page
  if (lastEl.type === 'scene-heading') {
    return { moveBack: 1 };
  }

  // Rule 4: If breaking in the middle of dialogue, keep with character block
  if (currentEl.type === 'dialogue' && lastEl.type === 'character') {
    return { moveBack: 1 };
  }

  return { moveBack: 0 };
}

/**
 * Get layout metrics for display/debug.
 */
export function getLayoutMetrics(lines) {
  const pages = paginate(lines);
  const measured = lines.map((line, i) => new MeasuredElement(line, i));

  let totalLines = 0;
  for (const m of measured) {
    totalLines += m.lineCount;
  }

  return {
    pageCount: pages.length,
    elementCount: lines.length,
    totalWrappedLines: totalLines,
    estimatedRuntime: lines.length < 50 ? '< 1 minute' :
      `~${Math.round(lines.length / 55)} minutes`,
    pages,
  };
}
