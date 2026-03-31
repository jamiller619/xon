import { Link, useLocation } from 'react-router-dom';
import styles from './NotFound.module.css';

export default function NotFound() {
  const location = useLocation();

  return (
    <div className={styles.page ?? ''}>
      <div className={styles.card ?? ''}>
        <div className={styles.code ?? ''}>404</div>
        <h1 className={styles.title ?? ''}>Page not found</h1>
        <p className={styles.message ?? ''}>
          <code className={styles.path ?? ''}>{location.pathname}</code> does
          not exist.
        </p>
        <Link to="/" className={styles.button ?? ''}>
          Go home
        </Link>
      </div>
    </div>
  );
}
