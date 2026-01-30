const STORAGE_KEY = 'healis.shortcuts.v1';

export const SHORTCUT_ACTIONS = [
  {
    id: 'tool.select',
    label: 'Инструмент: выделение',
    description: 'Переключиться на курсор/выделение',
    kind: 'press',
  },
  {
    id: 'tool.text',
    label: 'Инструмент: текст',
    description: 'Переключиться на текстовый инструмент',
    kind: 'press',
  },
  {
    id: 'tool.handHold',
    label: 'Инструмент: рука (удерживать)',
    description: 'Удерживать для перемещения доски (после отпускания возвращает предыдущий инструмент)',
    kind: 'hold',
  },
  {
    id: 'history.undo',
    label: 'Отменить',
    description: 'Отменить последнее действие на доске',
    kind: 'press',
  },
  {
    id: 'history.redo',
    label: 'Повторить',
    description: 'Повторить отменённое действие на доске',
    kind: 'press',
  },
];

export const DEFAULT_SHORTCUTS = {
  'tool.select': { code: 'KeyV', ctrl: false, shift: false, alt: false, meta: false },
  'tool.text': { code: 'KeyT', ctrl: false, shift: false, alt: false, meta: false },
  'tool.handHold': { code: 'Space', ctrl: false, shift: false, alt: false, meta: false },
  'history.undo': { code: 'KeyZ', ctrl: true, shift: false, alt: false, meta: false },
  // Common default: Ctrl+Shift+Z
  'history.redo': { code: 'KeyZ', ctrl: true, shift: true, alt: false, meta: false },
};

const RU_LABEL_BY_CODE = {
  KeyQ: 'Й',
  KeyW: 'Ц',
  KeyE: 'У',
  KeyR: 'К',
  KeyT: 'Е',
  KeyY: 'Н',
  KeyU: 'Г',
  KeyI: 'Ш',
  KeyO: 'Щ',
  KeyP: 'З',
  BracketLeft: 'Х',
  BracketRight: 'Ъ',
  KeyA: 'Ф',
  KeyS: 'Ы',
  KeyD: 'В',
  KeyF: 'А',
  KeyG: 'П',
  KeyH: 'Р',
  KeyJ: 'О',
  KeyK: 'Л',
  KeyL: 'Д',
  Semicolon: 'Ж',
  Quote: 'Э',
  KeyZ: 'Я',
  KeyX: 'Ч',
  KeyC: 'С',
  KeyV: 'М',
  KeyB: 'И',
  KeyN: 'Т',
  KeyM: 'Ь',
  Comma: 'Б',
  Period: 'Ю',
};

function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadShortcuts() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? safeParseJson(raw) : null;
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SHORTCUTS };

  const out = { ...DEFAULT_SHORTCUTS };
  for (const key of Object.keys(DEFAULT_SHORTCUTS)) {
    const s = parsed[key];
    if (!s || typeof s !== 'object') continue;
    if (typeof s.code !== 'string' || !s.code) continue;
    out[key] = {
      code: s.code,
      ctrl: Boolean(s.ctrl),
      shift: Boolean(s.shift),
      alt: Boolean(s.alt),
      meta: Boolean(s.meta),
    };
  }
  return out;
}

export function saveShortcuts(next) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next || {}));
}

export function resetShortcutsToDefaults() {
  saveShortcuts({ ...DEFAULT_SHORTCUTS });
  return { ...DEFAULT_SHORTCUTS };
}

export function shortcutFromKeyboardEvent(e) {
  return {
    code: e.code,
    ctrl: Boolean(e.ctrlKey),
    shift: Boolean(e.shiftKey),
    alt: Boolean(e.altKey),
    meta: Boolean(e.metaKey),
  };
}

export function matchShortcut(e, shortcut) {
  if (!shortcut) return false;
  if (String(e.code) !== String(shortcut.code)) return false;
  if (Boolean(e.ctrlKey) !== Boolean(shortcut.ctrl)) return false;
  if (Boolean(e.shiftKey) !== Boolean(shortcut.shift)) return false;
  if (Boolean(e.altKey) !== Boolean(shortcut.alt)) return false;
  if (Boolean(e.metaKey) !== Boolean(shortcut.meta)) return false;
  return true;
}

function baseLabelFromCode(code) {
  if (!code) return '';
  if (code === 'Space') return 'Space';
  if (code === 'Escape') return 'Esc';
  if (code === 'Enter') return 'Enter';
  if (code === 'Backspace') return 'Backspace';
  if (code === 'Delete') return 'Del';
  if (code === 'Tab') return 'Tab';

  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  return code;
}

export function formatShortcut(shortcut) {
  if (!shortcut?.code) return '—';
  const parts = [];
  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.shift) parts.push('Shift');
  if (shortcut.alt) parts.push('Alt');
  if (shortcut.meta) parts.push('Meta');

  const base = baseLabelFromCode(shortcut.code);
  const ru = RU_LABEL_BY_CODE[shortcut.code];
  const keyLabel = ru && ru !== base ? `${base}/${ru}` : base;
  parts.push(keyLabel);
  return parts.join('+');
}


