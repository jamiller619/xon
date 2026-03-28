import { create } from "zustand";

interface AppState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  viewMode: "grid" | "list";
  setViewMode: (mode: "grid" | "list") => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  viewMode: "grid",
  setViewMode: (mode) => set({ viewMode: mode }),
}));

const THEME_STORAGE_KEY = "xon:activeTheme";

interface ThemeState {
  activeThemeId: string | null;
  setActiveTheme: (id: string | null) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  activeThemeId: localStorage.getItem(THEME_STORAGE_KEY),
  setActiveTheme: (id) => {
    if (id === null) {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, id);
    }
    set({ activeThemeId: id });
  },
}));

export interface QueueItem {
  id: string;
  title: string;
  mimeType: string;
}

type RepeatMode = "none" | "one" | "all";

interface AudioPlayerState {
  queue: QueueItem[];
  currentIndex: number;
  playing: boolean;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  playTrack: (item: QueueItem) => void;
  addToQueue: (item: QueueItem) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  playAtIndex: (index: number) => void;
  playNext: () => void;
  playPrev: () => void;
  setPlaying: (playing: boolean) => void;
  setVolume: (volume: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  moveUp: (index: number) => void;
  moveDown: (index: number) => void;
}

export const useAudioStore = create<AudioPlayerState>((set) => ({
  queue: [],
  currentIndex: -1,
  playing: false,
  volume: 1,
  shuffle: false,
  repeat: "none",

  playTrack: (item) =>
    set((s) => {
      const existing = s.queue.findIndex((q) => q.id === item.id);
      if (existing >= 0) return { currentIndex: existing, playing: true };
      return { queue: [...s.queue, item], currentIndex: s.queue.length, playing: true };
    }),

  addToQueue: (item) =>
    set((s) => {
      if (s.queue.some((q) => q.id === item.id)) return {};
      const newQueue = [...s.queue, item];
      const newIndex = s.currentIndex === -1 ? newQueue.length - 1 : s.currentIndex;
      return { queue: newQueue, currentIndex: newIndex };
    }),

  removeFromQueue: (index) =>
    set((s) => {
      const newQueue = s.queue.filter((_, i) => i !== index);
      let newIndex = s.currentIndex;
      if (index < s.currentIndex) newIndex = s.currentIndex - 1;
      else if (index === s.currentIndex) {
        newIndex = newQueue.length > 0 ? Math.min(s.currentIndex, newQueue.length - 1) : -1;
      }
      return { queue: newQueue, currentIndex: newIndex, playing: newQueue.length > 0 && s.playing };
    }),

  clearQueue: () => set({ queue: [], currentIndex: -1, playing: false }),

  playAtIndex: (index) => set({ currentIndex: index, playing: true }),

  playNext: () =>
    set((s) => {
      if (s.queue.length === 0) return {};
      if (s.shuffle) {
        const next = Math.floor(Math.random() * s.queue.length);
        return { currentIndex: next, playing: true };
      }
      if (s.repeat === "one") return { playing: true };
      const next = s.currentIndex + 1;
      if (next >= s.queue.length) {
        if (s.repeat === "all") return { currentIndex: 0, playing: true };
        return { playing: false };
      }
      return { currentIndex: next, playing: true };
    }),

  playPrev: () =>
    set((s) => {
      if (s.queue.length === 0) return {};
      const prev = s.currentIndex - 1;
      if (prev < 0) {
        if (s.repeat === "all") return { currentIndex: s.queue.length - 1, playing: true };
        return { currentIndex: 0, playing: true };
      }
      return { currentIndex: prev, playing: true };
    }),

  setPlaying: (playing) => set({ playing }),
  setVolume: (volume) => set({ volume }),
  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
  toggleRepeat: () =>
    set((s) => {
      const modes: RepeatMode[] = ["none", "all", "one"];
      const next: RepeatMode = modes[(modes.indexOf(s.repeat) + 1) % modes.length] ?? "none";
      return { repeat: next };
    }),

  moveUp: (index) =>
    set((s) => {
      if (index <= 0) return {};
      const q = [...s.queue];
      const a = q[index - 1];
      const b = q[index];
      if (!a || !b) return {};
      q[index - 1] = b;
      q[index] = a;
      let ci = s.currentIndex;
      if (ci === index) ci = index - 1;
      else if (ci === index - 1) ci = index;
      return { queue: q, currentIndex: ci };
    }),

  moveDown: (index) =>
    set((s) => {
      if (index >= s.queue.length - 1) return {};
      const q = [...s.queue];
      const a = q[index];
      const b = q[index + 1];
      if (!a || !b) return {};
      q[index] = b;
      q[index + 1] = a;
      let ci = s.currentIndex;
      if (ci === index) ci = index + 1;
      else if (ci === index + 1) ci = index;
      return { queue: q, currentIndex: ci };
    }),
}));
