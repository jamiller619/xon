import {
  Glance20Filled as DashboardIcon,
  CircleSmall20Filled as LibraryIcon,
  Navigation20Filled as MenuIcon,
  PlugDisconnected20Filled as PluginsIcon,
  Settings20Filled as SettingsIcon,
  PersonCircle20Filled as UsersIcon,
} from '@fluentui/react-icons'
import { Button, Flex } from '@xon/ui'
import clsx from 'clsx'
import { NavLink } from 'react-router-dom'
import Logo from '~/components/logo/Logo'
import PluginSlot from '~/components/PluginSlot'
import useLibraries from '~/hooks/useLibraries'
import styles from './Sidebar.module.css'

interface SidebarProps {
  className?: string | undefined
  open: boolean
  onMenuClick: () => void
}

export default function Sidebar({
  open,
  className,
  onMenuClick,
}: SidebarProps) {
  const { libraries, isLoading } = useLibraries()

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `${styles.navLink}${isActive ? ` ${styles.active}` : ''}`

  return (
    <nav
      className={clsx(styles.sidebar, className, open && styles.open)}
      aria-label="Main navigation"
    >
      <Flex align="center" gap="4" className={styles.header}>
        {/* <IconButton onClick={onMenuClick} variant="ghost">
          <MenuIcon />
        </IconButton> */}
        <NavLink to="/" className={styles.logo ?? ''}>
          <Logo />
        </NavLink>
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
        {isLoading ? (
          <p className={styles.loadingLibraries}>Loading...</p>
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
        {/* <Button>Add New Library</Button> */}
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
