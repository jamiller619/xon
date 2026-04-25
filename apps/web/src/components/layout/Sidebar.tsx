import {
  Glance20Filled as DashboardIcon,
  CircleSmall20Filled as LibraryIcon,
  PlugDisconnected20Filled as PluginsIcon,
  Settings20Filled as SettingsIcon,
  PersonCircle20Filled as UsersIcon,
} from '@fluentui/react-icons'
import { Navigation20Filled as MenuIcon } from '@fluentui/react-icons'
import { Flex, IconButton } from '@xon/ui'
import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import PluginSlot from '~/components/PluginSlot'
import Logo from '~/components/logo/Logo'
import { apiFetch } from '~/lib/apiFetch'
import styles from './Sidebar.module.css'

interface Library {
  id: string
  name: string
}

interface SidebarProps {
  open: boolean
  onMenuClick: () => void
}

export default function Sidebar({ open, onMenuClick }: SidebarProps) {
  const [libraries, setLibraries] = useState<Library[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/api/v1/libraries')
      .then((r) => r.json())
      .then((data: Library[]) => setLibraries(data))
      .catch(() => setLibraries([]))
      .finally(() => setLoading(false))
  }, [])

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `${styles.navLink}${isActive ? ` ${styles.active}` : ''}`

  return (
    <nav
      className={`${styles.sidebar}${open ? ` ${styles.open}` : ''}`}
      aria-label="Main navigation"
    >
      <Flex justify="between" className={styles.header}>
        <NavLink to="/" className={styles.logo as string}>
          <Logo />
        </NavLink>
        {/* <IconButton onClick={onMenuClick} variant="ghost">
          <MenuIcon />
        </IconButton> */}
      </Flex>

      <Section>
        <NavLink to="/" end className={navClass}>
          <DashboardIcon />
          <span>Dashboard</span>
        </NavLink>
        <NavLink to="/admin/plugins" className={navClass}>
          <PluginsIcon />
          <span>Plugins</span>
        </NavLink>
        <NavLink to="/admin/users" className={navClass}>
          <UsersIcon />
          <span>Users</span>
        </NavLink>
        <NavLink to="/settings" className={navClass}>
          <SettingsIcon />
          <span>Settings</span>
        </NavLink>
        <PluginSlot injectionPoint="nav-item" />
      </Section>

      <Section>
        <div className={styles.sectionTitle}>Libraries</div>
        {loading ? (
          <p className={styles.loadingLibraries}>Loading…</p>
        ) : libraries.length === 0 ? (
          <p className={styles.emptyLibraries}>No libraries yet</p>
        ) : (
          libraries.map((lib) => (
            <NavLink
              key={lib.id}
              to={`/libraries/${lib.id}`}
              className={navClass}
            >
              <LibraryIcon />
              {lib.name}
            </NavLink>
          ))
        )}
      </Section>

      <Section>
        <div className={styles.sectionTitle}>Collections</div>
      </Section>
    </nav>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <Flex dir="col" gap="2" className={styles.section}>
      {children}
    </Flex>
  )
}
