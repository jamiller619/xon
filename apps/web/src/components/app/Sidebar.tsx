import {
  FolderAdd20Regular as AddLibraryIcon,
  Glance20Regular as DashboardIcon,
  Glance20Filled as DashboardOnIcon,
  Heart20Regular as FavoritesIcon,
  Folder20Regular as FolderIcon,
  DocumentText20Regular as LogViewerIcon,
  DocumentText20Filled as LogViewerOnIcon,
  Library20Regular as ManageLibrariesIcon,
  Library20Filled as ManageLibrariesOnIcon,
  MoviesAndTv20Regular as MoviesIcon,
  MusicNote220Regular as MusicIcon,
  Image20Regular as PhotosIcon,
  TextBulletList20Regular as PlaylistIcon,
  WindowConsole20Regular as ServerOutputIcon,
  WindowConsole20Filled as ServerOutputOnIcon,
  Settings20Regular as SettingsIcon,
  Settings20Filled as SettingsOnIcon,
  Tv20Regular as TVIcon,
} from '@fluentui/react-icons'
import { useQuery } from '@tanstack/react-query'
import { type Group, GroupType, LibraryType } from '@xon/shared'
import { Flex, Surface } from '@xon/ui'
import clsx from 'clsx'
import { NavLink } from 'react-router-dom'
import Logo from '~/components/logo/Logo'
import PluginSlot from '~/components/PluginSlot'
import useLibraries from '~/hooks/useLibraries'
import useQueryAPIHelper from '~/hooks/useQueryAPIHelper'
import styles from './Sidebar.module.css'

interface SidebarProps {
  className?: string | undefined
  isOpen: boolean
}

export default function Sidebar({ className, isOpen }: SidebarProps) {
  const { data: libraries } = useLibraries()

  const { data: groups } = useQuery<Group[]>(useQueryAPIHelper('groups'))

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `${styles.navLink}${isActive ? ` ${styles.active}` : ''}`

  return (
    <Surface
      as="nav"
      id="main-navigation"
      borderRadius="none"
      className={clsx(styles.sidebar, className, isOpen && styles.open)}
      aria-label="Main navigation"
    >
      <Flex align="center" gap="4" className={styles.header}>
        <NavLink to="/" className={styles.logo ?? ''}>
          <Logo />
        </NavLink>
      </Flex>

      <Section>
        <NavLink to="/" end className={navClass}>
          <NavItem label="Dashboard" />
        </NavLink>
        <PluginSlot injectionPoint="nav-item" />
      </Section>

      <Section>
        <div className={styles.sectionTitle}>Libraries</div>
        {Array.isArray(libraries) &&
          libraries.map((lib) => (
            <NavLink
              key={lib.id}
              to={`/libraries/${lib.id}`}
              className={navClass}
            >
              <LibraryIcon type={lib.type} />
              <span>{lib.name}</span>
            </NavLink>
          ))}
        <NavLink to="" className={styles.navLink ?? ''}>
          <AddLibraryIcon />
          <span>Add Library</span>
        </NavLink>
      </Section>

      <Section>
        <div className={styles.sectionTitle}>Collections</div>
        {Array.isArray(groups) &&
          groups.map((collection) => (
            <NavLink
              key={collection.id}
              to={`/collections/${collection.id}`}
              className={navClass}
            >
              <CollectionIcon type={collection.type} />
              <span>{collection.title}</span>
            </NavLink>
          ))}
        <NavLink to="" className={styles.navLink ?? ''}>
          <AddLibraryIcon />
          <span>Add Collection</span>
        </NavLink>
      </Section>
      <Section>
        <div className={styles.sectionTitle}>Admin</div>
        <NavLink to="/settings" className={navClass}>
          <NavItem label="Settings" />
        </NavLink>
        <NavLink to="/admin/libraries" className={navClass}>
          <NavItem label="Manage Libraries" />
        </NavLink>
        <NavLink to="/admin/logs" className={navClass}>
          <NavItem label="Log Viewer" />
        </NavLink>
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
  'Manage Libraries': {
    default: <ManageLibrariesIcon />,
    active: <ManageLibrariesOnIcon />,
  },
}

type NavItemProps = {
  label: keyof typeof navIcons
}

function NavItem({ label }: NavItemProps) {
  const icons = navIcons[label]

  return (
    <>
      <span className={styles.iconDefault}>{icons.default}</span>
      <span className={styles.iconActive}>{icons.active}</span>
      <span>{label}</span>
    </>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <Flex dir="col" gap="2" className={styles.section}>
      {children}
    </Flex>
  )
}

function CollectionIcon({ type }: { type?: GroupType | undefined }) {
  if (type === GroupType.Playlist) {
    return <FolderIcon />
  } else if (type === GroupType.Favorites) {
    return <FavoritesIcon />
  }

  return <PlaylistIcon />
}

function LibraryIcon({ type }: { type?: LibraryType | undefined }) {
  switch (type) {
    case LibraryType.Movies:
      return <MoviesIcon />
    case LibraryType.TVShows:
    case LibraryType.HomeVideos:
      return <TVIcon />
    case LibraryType.Music:
      return <MusicIcon />
    case LibraryType.Photos:
      return <PhotosIcon />
  }
}
