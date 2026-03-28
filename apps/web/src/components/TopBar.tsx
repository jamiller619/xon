import styles from "./TopBar.module.css";

interface TopBarProps {
  onMenuClick: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  return (
    <header className={styles.topBar ?? ""}>
      <button
        type="button"
        className={styles.menuButton ?? ""}
        onClick={onMenuClick}
        aria-label="Toggle sidebar"
      >
        ☰
      </button>
      <div className={styles.searchWrapper ?? ""}>
        <input
          className={styles.searchInput ?? ""}
          type="search"
          placeholder="Search media..."
          aria-label="Search"
        />
      </div>
      <span className={styles.spacer ?? ""} />
      <button type="button" className={styles.userMenu ?? ""} aria-label="User menu">
        <span className={styles.avatar ?? ""}>U</span>
        <span>User</span>
      </button>
    </header>
  );
}
