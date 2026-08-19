import {
  Glance20Regular as DashboardIcon,
  Glance20Filled as DashboardOnIcon,
  Heart20Regular as FavoritesIcon,
  Folder20Regular as FolderIcon,
  DocumentText20Regular as LogViewerIcon,
  DocumentText20Filled as LogViewerOnIcon,
  Library20Regular as ManageLibrariesIcon,
  Library20Filled as ManageLibrariesOnIcon,
  TextBulletList20Regular as PlaylistIcon,
  WindowConsole20Regular as ServerOutputIcon,
  WindowConsole20Filled as ServerOutputOnIcon,
  Key20Regular as SessionsIcon,
  Key20Filled as SessionsOnIcon,
  Settings20Regular as SettingsIcon,
  Settings20Filled as SettingsOnIcon,
} from '@fluentui/react-icons'
import { CollectionType } from '@xon/shared'
import { Flex, Surface } from '@xon/ui'
import clsx from 'clsx'
import { type NavLinkProps, NavLink as RouterNavLink } from 'react-router-dom'
import Eyebrow from '~/components/Eyebrow'
import Logo from '~/components/logo/Logo'
import PluginSlot from '~/components/PluginSlot'
import useCollections from '~/hooks/useCollections'
import useLibraries from '~/hooks/useLibraries'
import LibraryIcon from '../icons/LibraryIcon'
import styles from './Sidebar.module.css'

interface SidebarProps {
  className?: string | undefined
  isOpen: boolean
}

export default function Sidebar({ className, isOpen }: SidebarProps) {
  const { data: libraries } = useLibraries()

  const [collections] = useCollections()

  return (
    <Surface
      as="nav"
      id="main-navigation"
      borderRadius="none"
      className={clsx(styles.sidebar, className, isOpen && styles.open)}
      aria-label="Main navigation"
    >
      {/* LOGO */}
      <Flex align="center" gap="4" className={styles.header}>
        <RouterNavLink to="/" className={styles.logo ?? ''}>
          <Logo />
        </RouterNavLink>
      </Flex>

      <Section>
        <NavItem label="Dashboard" to="/" end />
        <PluginSlot injectionPoint="nav-item" />
      </Section>

      {/* LIBRARIES SECTION */}
      <Section>
        <Eyebrow className={styles.sectionTitle}>Libraries</Eyebrow>
        {Array.isArray(libraries) &&
          libraries.map((lib) => (
            <NavLink key={lib.id} to={`/libraries/${lib.id}`}>
              <span className={styles.iconDefault}>
                <LibraryIcon type={lib.type} />
              </span>
              <span className={styles.iconActive}>
                <LibraryIcon type={lib.type} filled />
              </span>
              <span>{lib.name}</span>
            </NavLink>
          ))}
        <NavItem label="Manage Libraries" to="/admin/libraries" />
      </Section>

      {/* COLLECTIONS SECTION */}
      <Section>
        <Eyebrow className={styles.sectionTitle}>Collections</Eyebrow>
        {Array.isArray(collections) &&
          collections.map((collection) => (
            <NavLink key={collection.id} to={`/collections/${collection.id}`}>
              <CollectionIcon type={collection.type} />
              <span>{collection.title}</span>
            </NavLink>
          ))}
        <NavItem label="Manage Collections" to="/admin/collections" />
      </Section>

      {/* ACCOUNT SECTION */}
      <Section>
        <Eyebrow className={styles.sectionTitle}>Account</Eyebrow>
        <NavItem label="Sessions" to="/account/sessions" />
      </Section>

      {/* ADMIN SECTION */}
      <Section>
        <Eyebrow className={styles.sectionTitle}>Admin</Eyebrow>
        <NavItem label="Settings" to="/settings" />
        <NavItem label="Users" to="/admin/users" />
        <NavItem label="Plugins" to="/admin/plugins" />
        <NavItem label="Log Viewer" to="/admin/logs" />
      </Section>
    </Surface>
  )
}

const navIcons = {
  Dashboard: {
    default: <DashboardIcon />,
    active: <DashboardOnIcon />,
  },
  'Server Output': {
    default: <ServerOutputIcon />,
    active: <ServerOutputOnIcon />,
  },
  'Log Viewer': {
    default: <LogViewerIcon />,
    active: <LogViewerOnIcon />,
  },
  Settings: {
    default: <SettingsIcon />,
    active: <SettingsOnIcon />,
  },
  Sessions: {
    default: <SessionsIcon />,
    active: <SessionsOnIcon />,
  },
  'Manage Libraries': {
    default: <ManageLibrariesIcon />,
    active: <ManageLibrariesOnIcon />,
  },
  'Manage Collections': {
    default: <ManageLibrariesIcon />,
    active: <ManageLibrariesOnIcon />,
  },
  Users: {
    default: <ManageLibrariesIcon />,
    active: <ManageLibrariesOnIcon />,
  },
  Plugins: {
    default: <ManageLibrariesIcon />,
    active: <ManageLibrariesOnIcon />,
  },
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  clsx(styles.navLink, {
    [styles.active as string]: isActive,
  })

type NavItemProps = NavLinkProps & {
  label: keyof typeof navIcons
}

function NavLink({ children, className, ...props }: NavLinkProps) {
  return (
    <RouterNavLink
      className={clsx(navClass, styles.navLink, className)}
      {...props}
    >
      {children}
    </RouterNavLink>
  )
}

function NavItem({ label, ...props }: NavItemProps) {
  const icons = navIcons[label]

  return (
    <NavLink className={navClass} {...props}>
      <span className={styles.iconDefault}>{icons.default}</span>
      <span className={styles.iconActive}>{icons.active}</span>
      <span>{label}</span>
    </NavLink>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <Flex dir="col" gap="1" className={styles.section}>
      {children}
    </Flex>
  )
}

function CollectionIcon({ type }: { type?: CollectionType | undefined }) {
  if (type === CollectionType.Playlist) {
    return <FolderIcon />
  } else if (type === CollectionType.Favorites) {
    return <FavoritesIcon />
  }

  return <PlaylistIcon />
}
