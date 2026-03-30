/**
 * Autocomplete engine for screenplay elements.
 * Tracks scene headings and character names used in the script
 * and provides suggestions while typing.
 */

export class AutocompleteEngine {
  constructor() {
    this.sceneHeadings = new Set();
    this.characters = new Set();
    this.transitions = new Set([
      'CUT TO:', 'FADE TO:', 'DISSOLVE TO:', 'SMASH CUT TO:',
      'FADE OUT.', 'FADE IN:', 'MATCH CUT TO:', 'JUMP CUT TO:',
      'WIPE TO:', 'IRIS OUT.',
    ]);
    this.locations = new Set();
    this.timesOfDay = ['DAY', 'NIGHT', 'DAWN', 'DUSK', 'MORNING', 'AFTERNOON', 'EVENING', 'CONTINUOUS', 'LATER', 'MOMENTS LATER'];

    this.dropdownEl = null;
    this.selectedIndex = -1;
    this.currentSuggestions = [];
    this.onSelect = null;
  }

  /**
   * Scan the script and rebuild the index of known names/headings.
   */
  indexScript(lines) {
    this.sceneHeadings.clear();
    this.characters.clear();
    this.locations.clear();

    for (const line of lines) {
      if (line.type === 'scene-heading' && line.text.trim()) {
        this.sceneHeadings.add(line.text.trim().toUpperCase());
        // Extract location
        const match = line.text.match(/(?:INT\.|EXT\.|INT\.\/EXT\.|I\/E\.)\s*(.+?)(?:\s*-\s*.+)?$/i);
        if (match) {
          this.locations.add(match[1].trim().toUpperCase());
        }
      }
      if (line.type === 'character' && line.text.trim()) {
        // Strip parenthetical extensions like (V.O.), (O.S.), (CONT'D)
        const name = line.text.trim().toUpperCase().replace(/\s*\(.*?\)\s*$/, '').trim();
        if (name) this.characters.add(name);
      }
    }
  }

  /**
   * Get suggestions for the given element type and partial text.
   */
  getSuggestions(type, partialText) {
    const text = (partialText || '').toUpperCase().trim();
    if (!text) return [];

    let pool = [];

    switch (type) {
      case 'scene-heading':
        // Suggest full scene headings or compose from location + time
        pool = [...this.sceneHeadings];
        // Also add location-based suggestions
        if (/^(INT\.|EXT\.|INT\.\/EXT\.|I\/E\.)\s*/i.test(text)) {
          const prefix = text.match(/^(INT\.|EXT\.|INT\.\/EXT\.|I\/E\.)\s*/i)[0];
          const rest = text.slice(prefix.length);
          for (const loc of this.locations) {
            if (loc.startsWith(rest) && rest !== loc) {
              for (const time of this.timesOfDay) {
                pool.push(`${prefix}${loc} - ${time}`);
              }
            }
          }
        }
        break;

      case 'character':
        pool = [...this.characters];
        break;

      case 'transition':
        pool = [...this.transitions];
        break;

      default:
        return [];
    }

    // Filter by prefix match
    const filtered = pool.filter(item => item.startsWith(text) && item !== text);
    // Deduplicate and limit
    return [...new Set(filtered)].slice(0, 8);
  }

  /**
   * Show the autocomplete dropdown near the given element.
   */
  show(targetEl, suggestions, onSelect) {
    this.hide();
    if (suggestions.length === 0) return;

    this.currentSuggestions = suggestions;
    this.onSelect = onSelect;
    this.selectedIndex = 0;

    this.dropdownEl = document.createElement('div');
    this.dropdownEl.className = 'autocomplete-dropdown';

    for (let i = 0; i < suggestions.length; i++) {
      const item = document.createElement('div');
      item.className = 'autocomplete-item' + (i === 0 ? ' selected' : '');
      item.textContent = suggestions[i];
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.selectItem(i);
      });
      this.dropdownEl.appendChild(item);
    }

    // Position below the target element
    const rect = targetEl.getBoundingClientRect();
    this.dropdownEl.style.left = `${rect.left}px`;
    this.dropdownEl.style.top = `${rect.bottom + 2}px`;
    this.dropdownEl.style.minWidth = `${rect.width}px`;

    document.body.appendChild(this.dropdownEl);
  }

  /**
   * Hide the dropdown.
   */
  hide() {
    if (this.dropdownEl) {
      this.dropdownEl.remove();
      this.dropdownEl = null;
    }
    this.currentSuggestions = [];
    this.selectedIndex = -1;
    this.onSelect = null;
  }

  /**
   * Handle keyboard navigation in the dropdown.
   * Returns true if the key was handled.
   */
  handleKey(e) {
    if (!this.dropdownEl) return false;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedIndex = Math.min(this.selectedIndex + 1, this.currentSuggestions.length - 1);
      this.updateSelection();
      return true;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
      this.updateSelection();
      return true;
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      if (this.selectedIndex >= 0) {
        e.preventDefault();
        this.selectItem(this.selectedIndex);
        return true;
      }
    }

    if (e.key === 'Escape') {
      this.hide();
      return true;
    }

    return false;
  }

  selectItem(index) {
    if (index >= 0 && index < this.currentSuggestions.length && this.onSelect) {
      this.onSelect(this.currentSuggestions[index]);
    }
    this.hide();
  }

  updateSelection() {
    if (!this.dropdownEl) return;
    const items = this.dropdownEl.querySelectorAll('.autocomplete-item');
    items.forEach((item, i) => {
      item.classList.toggle('selected', i === this.selectedIndex);
    });
  }

  get isVisible() {
    return !!this.dropdownEl;
  }
}
