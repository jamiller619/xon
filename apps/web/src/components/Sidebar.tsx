import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { apiFetch } from '../apiFetch.js';
import PluginSlot from './PluginSlot.js';
import styles from './Sidebar.module.css';

interface Library {
  id: string;
  name: string;
}

interface SidebarProps {
  open: boolean;
}

export default function Sidebar({ open }: SidebarProps) {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/v1/libraries')
      .then((r) => r.json())
      .then((data: Library[]) => setLibraries(data))
      .catch(() => setLibraries([]))
      .finally(() => setLoading(false));
  }, []);

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `${styles.navLink ?? ''}${isActive ? ` ${styles.active ?? ''}` : ''}`;

  const libClass = ({ isActive }: { isActive: boolean }) =>
    `${styles.libraryLink ?? ''}${isActive ? ` ${styles.active ?? ''}` : ''}`;

  return (
    <nav
      className={`${styles.sidebar ?? ''}${open ? ` ${styles.open ?? ''}` : ''}`}
      aria-label="Main navigation"
    >
      <NavLink to="/" className={styles.logo ?? ''}>
        <span className={styles.logoIcon ?? ''}>▶</span>
        <span>Xon</span>
      </NavLink>

      <div className={styles.section ?? ''}>
        <p className={styles.sectionTitle ?? ''}>Navigation</p>
        <NavLink to="/" end className={navClass}>
          <span className={styles.navIcon ?? ''}>⊞</span>
          Dashboard
        </NavLink>
        <NavLink to="/search" className={navClass}>
          <span className={styles.navIcon ?? ''}>⌕</span>
          Search
        </NavLink>
        <NavLink to="/settings" className={navClass}>
          <span className={styles.navIcon ?? ''}>⚙</span>
          Settings
        </NavLink>
        <NavLink to="/admin/plugins" className={navClass}>
          <span className={styles.navIcon ?? ''}>⊛</span>
          Plugins
        </NavLink>
        <NavLink to="/admin/users" className={navClass}>
          <span className={styles.navIcon ?? ''}>👥</span>
          Users
        </NavLink>
        <NavLink to="/admin/library-access" className={navClass}>
          <span className={styles.navIcon ?? ''}>🔑</span>
          Library Access
        </NavLink>
        <PluginSlot injectionPoint="nav-item" />
      </div>

      <div className={styles.section ?? ''}>
        <p className={styles.sectionTitle ?? ''}>Libraries</p>
        {loading ? (
          <p className={styles.loadingLibraries ?? ''}>Loading…</p>
        ) : libraries.length === 0 ? (
          <p className={styles.emptyLibraries ?? ''}>No libraries yet</p>
        ) : (
          <ul className={styles.librariesList ?? ''}>
            {libraries.map((lib) => (
              <li key={lib.id}>
                <NavLink to={`/libraries/${lib.id}`} className={libClass}>
                  <span className={styles.libraryDot ?? ''} />
                  {lib.name}
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </nav>
  );
}
