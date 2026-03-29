import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../apiFetch.js";
import PluginSlot from "../components/PluginSlot.js";
import { useThemeStore } from "../store/index.js";
import styles from "./Settings.module.css";

interface ThemeInfo {
  id: string;
  name: string;
  description: string;
  active: boolean;
  cssUrl?: string;
  jsUrl?: string;
}

interface UserPrefs {
  hideDrmItems: boolean;
}

export default function Settings() {
  const [themes, setThemes] = useState<ThemeInfo[]>([]);
  const activeThemeId = useThemeStore((s) => s.activeThemeId);
  const setActiveTheme = useThemeStore((s) => s.setActiveTheme);

  const [prefs, setPrefs] = useState<UserPrefs>({ hideDrmItems: false });

  const loadPrefs = useCallback(() => {
    apiFetch("/api/v1/users/me")
      .then((r) => r.json())
      .then((data: unknown) => {
        const d = data as { hideDrmItems?: boolean };
        setPrefs({ hideDrmItems: d.hideDrmItems ?? false });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch("/api/v1/themes")
      .then((r) => r.json() as Promise<ThemeInfo[]>)
      .then(setThemes)
      .catch(() => {});
    loadPrefs();
  }, [loadPrefs]);

  async function toggleHideDrm(value: boolean) {
    setPrefs((p) => ({ ...p, hideDrmItems: value }));
    await apiFetch("/api/v1/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hideDrmItems: value }),
    }).catch(() => {
      // Revert on failure
      setPrefs((p) => ({ ...p, hideDrmItems: !value }));
    });
  }

  return (
    <div className={styles.page ?? ""}>
      <h1 className={styles.heading ?? ""}>Settings</h1>

      <section className={styles.section ?? ""}>
        <h2 className={styles.sectionHeading ?? ""}>Content</h2>
        <label className={styles.prefOption ?? ""}>
          <input
            type="checkbox"
            checked={prefs.hideDrmItems}
            onChange={(e) => toggleHideDrm(e.target.checked)}
          />
          <span className={styles.prefLabel ?? ""}>
            Hide DRM-protected items from library views
          </span>
        </label>
      </section>

      <section className={styles.section ?? ""}>
        <h2 className={styles.sectionHeading ?? ""}>Theme</h2>
        <p className={styles.sectionDescription ?? ""}>
          Choose a theme to customize the appearance of the web UI. Only one theme can be active at
          a time.
        </p>

        <div className={styles.themeList ?? ""}>
          <label className={styles.themeOption ?? ""}>
            <input
              type="radio"
              name="theme"
              value=""
              checked={activeThemeId === null}
              onChange={() => setActiveTheme(null)}
            />
            <span className={styles.themeName ?? ""}>Default</span>
            <span className={styles.themeDescription ?? ""}>No theme — use built-in styles</span>
          </label>

          {themes.map((theme) => (
            <label key={theme.id} className={styles.themeOption ?? ""}>
              <input
                type="radio"
                name="theme"
                value={theme.id}
                checked={activeThemeId === theme.id}
                onChange={() => setActiveTheme(theme.id)}
              />
              <span className={styles.themeName ?? ""}>{theme.name}</span>
              <span className={styles.themeDescription ?? ""}>{theme.description}</span>
              {!theme.active && <span className={styles.themeInactive ?? ""}>(inactive)</span>}
            </label>
          ))}

          {themes.length === 0 && (
            <p className={styles.noThemes ?? ""}>No theme plugins installed.</p>
          )}
        </div>
      </section>

      <PluginSlot injectionPoint="settings:page" />
    </div>
  );
}
