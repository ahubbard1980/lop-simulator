import { create } from 'zustand';

export interface Settings {
  topColor: string;
  bottomColor: string;
}

const DEFAULT_SETTINGS: Settings = {
  topColor: '#6b6c70',
  bottomColor: '#6b6c70',
};

// Bumped when the default palette changes so browsers holding an old saved
// value (from before this palette existed) get the new defaults instead of
// silently overriding the stylesheet forever — a plain reload doesn't clear
// localStorage, so without this a stale color follows you across restarts.
const STORAGE_KEY = 'lop-sim-settings-v2';

// Each play-area surface is rendered as a subtle two-stop gradient for depth;
// derive the darker stop from whatever flat color the user picks.
function darken(hex: string, amount: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => Math.max(0, Math.round(parseInt(h, 16) * (1 - amount))));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function applyToDocument(settings: Settings) {
  document.documentElement.style.setProperty('--surface-top', settings.topColor);
  document.documentElement.style.setProperty('--surface-top-2', darken(settings.topColor, 0.22));
  document.documentElement.style.setProperty('--surface-bottom', settings.bottomColor);
  document.documentElement.style.setProperty('--surface-bottom-2', darken(settings.bottomColor, 0.22));
}

interface SettingsState extends Settings {
  setColor: (which: 'topColor' | 'bottomColor', value: string) => void;
  resetColors: () => void;
}

const initial = loadSettings();
applyToDocument(initial);

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...initial,
  setColor: (which, value) => {
    const next = { ...get(), [which]: value };
    set({ [which]: value } as Partial<SettingsState>);
    applyToDocument(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ topColor: next.topColor, bottomColor: next.bottomColor }));
  },
  resetColors: () => {
    set(DEFAULT_SETTINGS);
    applyToDocument(DEFAULT_SETTINGS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
  },
}));
