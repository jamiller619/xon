import {
  Glance20Regular as DashboardIcon,
  Glance20Filled as DashboardOnIcon,
  Heart20Regular as FavoritesIcon,
  Folder20Regular as FolderIcon,
  MoviesAndTv20Regular as MoviesIcon,
  MusicNote220Regular as MusicIcon,
  TextBulletList20Regular as PlaylistIcon,
  // CircleSmall20Regular as LibraryIcon,
  PlugDisconnected20Regular as PluginsIcon,
  PlugDisconnected20Filled as PluginsOnIcon,
  WindowConsole20Regular as ServerOutputIcon,
  WindowConsole20Filled as ServerOutputOnIcon,
  Settings20Regular as SettingsIcon,
  Settings20Filled as SettingsOnIcon,
  Tv20Regular as TVIcon,
  PersonCircle20Regular as UsersIcon,
  PersonCircle20Filled as UsersOnIcon,
} from '@fluentui/react-icons'
import { useQuery } from '@tanstack/react-query'
import { type Group, GroupType, LibraryType } from '@xon/shared'
import { Flex, Surface } from '@xon/ui'
import clsx from 'clsx'
import { NavLink } from 'react-router-dom'
import Logo from '~/components/logo/Logo'
import PluginSlot from '~/components/PluginSlot'
import useQueryAPIHelper from '~/hooks/useQueryAPIHelper'
import { librariesQuery } from '~/lib/librariesApi'
import styles from './Sidebar.module.css'

interface SidebarProps {
  className?: string | undefined
  isOpen: boolean
}

export default function Sidebar({ className, isOpen }: SidebarProps) {
  const { isPending, error, data: libraries } = useQuery(librariesQuery)

  const {
    isPending: isPendingGroups,
    error: errorGroups,
    data: groups,
  } = useQuery<Group[]>(useQueryAPIHelper('groups'))

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `${styles.navLink}${isActive ? ` ${styles.active}` : ''}`

  return (
    <Surface
      as="nav"
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
        <NavLink to="/admin/plugins" className={navClass}>
          <NavItem label="Plugins" />
        </NavLink>
        <NavLink to="/admin/users" className={navClass}>
          <NavItem label="Users" />
        </NavLink>
        <NavLink to="/admin/logs" className={navClass}>
          <NavItem label="Server Output" />
        </NavLink>
        <NavLink to="/settings" className={navClass}>
          <NavItem label="Settings" />
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
        {/* <Button>Add New Library</Button> */}
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
      </Section>
    </Surface>
  )
}

const navIcons = {
  Dashboard: {
    default: <DashboardIcon />,
    active: <DashboardOnIcon />,
  },
  Plugins: {
    default: <PluginsIcon />,
    active: <PluginsOnIcon />,
  },
  Users: {
    default: <UsersIcon />,
    active: <UsersOnIcon />,
  },
  'Server Output': {
    default: <ServerOutputIcon />,
    active: <ServerOutputOnIcon />,
  },
  Settings: {
    default: <SettingsIcon />,
    active: <SettingsOnIcon />,
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
  }
}
