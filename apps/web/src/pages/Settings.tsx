import { useEffect, useState } from "react";
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

export default function Settings() {
  const [themes, setThemes] = useState<ThemeInfo[]>([]);
  const activeThemeId = useThemeStore((s) => s.activeThemeId);
  const setActiveTheme = useThemeStore((s) => s.setActiveTheme);

  useEffect(() => {
    fetch("/api/v1/themes")
      .then((r) => r.json() as Promise<ThemeInfo[]>)
      .then(setThemes)
      .catch(() => {});
  }, []);

  return (
    <div className={styles.page ?? ""}>
      <h1 className={styles.heading ?? ""}>Settings</h1>

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
