import { useEffect } from 'react';
import { apiFetch } from '../apiFetch.js';
import { useThemeStore } from '../store/index.js';

interface ThemeInfo {
  id: string;
  cssUrl?: string;
  jsUrl?: string;
}

/**
 * Loads the active theme's CSS (and optional JS) into the document head.
 * Cleans up injected elements when theme changes or component unmounts.
 * Renders nothing — side-effects only.
 */
export default function ThemeLoader() {
  const activeThemeId = useThemeStore((s) => s.activeThemeId);

  useEffect(() => {
    if (!activeThemeId) return;

    let cancelled = false;
    const injected: HTMLElement[] = [];

    apiFetch('/api/v1/themes')
      .then((r) => r.json() as Promise<ThemeInfo[]>)
      .then((themes) => {
        if (cancelled) return;
        const theme = themes.find((t) => t.id === activeThemeId);
        if (!theme) return;

        if (theme.cssUrl) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = theme.cssUrl;
          link.dataset.xonTheme = activeThemeId;
          document.head.appendChild(link);
          injected.push(link);
        }

        if (theme.jsUrl) {
          const script = document.createElement('script');
          script.type = 'module';
          script.src = theme.jsUrl;
          script.dataset.xonTheme = activeThemeId;
          document.head.appendChild(script);
          injected.push(script);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      for (const el of injected) el.remove();
    };
  }, [activeThemeId]);

  return null;
}
