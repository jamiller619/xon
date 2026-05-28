import {
  Glance20Filled as DashboardIcon,
  Heart20Filled as FavoritesIcon,
  Folder20Filled as FolderIcon,
  MoviesAndTv20Filled as MoviesIcon,
  MusicNote220Filled as MusicIcon,
  TextBulletList20Filled as PlaylistIcon,
  // CircleSmall20Filled as LibraryIcon,
  PlugDisconnected20Filled as PluginsIcon,
  Settings20Filled as SettingsIcon,
  Tv20Filled as TVIcon,
  PersonCircle20Filled as UsersIcon,
} from '@fluentui/react-icons'
import { useQuery } from '@tanstack/react-query'
import { type Group, GroupType, type Library, MediaCategory } from '@xon/shared'
import { Flex } from '@xon/ui'
import clsx from 'clsx'
import { NavLink } from 'react-router-dom'
import Logo from '~/components/logo/Logo'
import PluginSlot from '~/components/PluginSlot'
import styles from './Sidebar.module.css'

interface SidebarProps {
  className?: string | undefined
  isOpen: boolean
}

export default function Sidebar({ className, isOpen }: SidebarProps) {
  const {
    isPending,
    error,
    data: libraries,
  } = useQuery<Library[]>({
    queryKey: ['libraries'],
    queryFn: () => fetch('/api/libraries').then((r) => r.json()),
  })

  const {
    isPending: isPendingGroups,
    error: errorGroups,
    data: groups,
  } = useQuery<Group[]>({
    queryKey: ['groups'],
    queryFn: () => fetch('/api/groups').then((r) => r.json()),
  })

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `${styles.navLink}${isActive ? ` ${styles.active}` : ''}`

  return (
    <nav
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
        {libraries?.map((lib) => (
          <NavLink
            key={lib.id}
            to={`/libraries/${lib.id}`}
            className={navClass}
          >
            <LibraryIcon type={lib.mediaCategories.at(0)} />
            <span>{lib.name}</span>
          </NavLink>
        ))}
        {/* <Button>Add New Library</Button> */}
      </Section>

      <Section>
        <div className={styles.sectionTitle}>Collections</div>
        {groups?.map((collection) => (
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

function CollectionIcon({ type }: { type?: GroupType | undefined }) {
  if (type === GroupType.Playlist) {
    return <FolderIcon />
  } else if (type === GroupType.Favorites) {
    return <FavoritesIcon />
  }

  return <PlaylistIcon />
}

function LibraryIcon({ type }: { type?: MediaCategory | undefined }) {
  switch (type) {
    case MediaCategory.Movies:
      return <MoviesIcon />
    case MediaCategory.TVShows:
      return <TVIcon />
    case MediaCategory.Music:
      return <MusicIcon />
  }
}
