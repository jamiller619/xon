import { Badge } from '@xon/ui'
import { Link } from 'react-router-dom'
import styles from './Breadcrumbs.module.css'

type BreadcrumbsProps = {
  label: string
}

export default function Breadcrumbs({ label }: BreadcrumbsProps) {
  return (
    <div className={styles.breadcrumb}>
      <Badge>
        <Link to="/" className={styles.breadcrumbLink}>
          Dashboard
        </Link>
      </Badge>
      <span className={styles.breadcrumbSep}>/</span>
      <Badge>
        <span className={styles.breadcrumbCurrent}>{label}</span>
      </Badge>
    </div>
  )
}
