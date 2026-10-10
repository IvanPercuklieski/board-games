/** Shared look for text buttons and icon buttons (host element is the native button/link). */
export const BUTTON_STYLES = `
  :host {
    --_bg: var(--bt-color-accent);
    --_fg: var(--bt-color-on-accent);
    --_bg-hover: var(--bt-color-accent-hover);
    --_border: transparent;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--bt-space-2);
    min-height: 2.5rem;
    padding: 0 var(--bt-space-5);
    border: var(--bt-border-width) solid var(--_border);
    border-radius: var(--bt-radius-md);
    background: var(--_bg);
    color: var(--_fg);
    font-family: var(--bt-font-sans);
    font-size: var(--bt-text-sm);
    font-weight: 600;
    letter-spacing: 0.01em;
    line-height: 1;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
    transition:
      background-color var(--bt-duration-fast) var(--bt-ease-standard),
      border-color var(--bt-duration-fast) var(--bt-ease-standard),
      transform var(--bt-duration-fast) var(--bt-ease-standard);
  }
  :host(:hover:not([disabled])) {
    background: var(--_bg-hover);
  }
  :host(:active:not([disabled])) {
    transform: translateY(1px);
  }
  :host([disabled]) {
    cursor: not-allowed;
    opacity: 0.55;
  }
  :host([aria-busy='true']) {
    cursor: progress;
    opacity: 0.85;
  }

  :host(.bt-button--secondary) {
    --_bg: var(--bt-color-surface-raised);
    --_fg: var(--bt-color-text);
    --_bg-hover: var(--bt-color-surface-sunken);
    --_border: var(--bt-color-border-strong);
  }
  :host(.bt-button--ghost) {
    --_bg: transparent;
    --_fg: var(--bt-color-text);
    --_bg-hover: var(--bt-color-surface-sunken);
  }
  :host(.bt-button--danger) {
    --_bg: var(--bt-color-danger);
    --_fg: var(--bt-color-on-danger);
    --_bg-hover: var(--bt-color-danger-text);
  }

  :host(.bt-button--sm) {
    min-height: 2rem;
    padding: 0 var(--bt-space-3);
    font-size: var(--bt-text-xs);
  }
  :host(.bt-button--lg) {
    min-height: 3rem;
    padding: 0 var(--bt-space-6);
    font-size: var(--bt-text-base);
  }
`;
