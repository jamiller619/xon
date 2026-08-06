import {
  Navigation20Regular as MenuIcon,
  SignOutRegular as SignOutIcon,
  PersonCircle16Regular as UserIcon,
} from '@fluentui/react-icons'
import { Button, Menu, Surface } from '@xon/ui'
import authClient from '~/lib/authClient'
import SearchDialog from '../search-dialog/SearchDialog'
import styles from './TopBar.module.css'

type TopBarProps = {
  isSidebarOpen?: boolean
  onMenuClick?: () => void
}

export default function TopBar({
  isSidebarOpen = false,
  onMenuClick,
}: TopBarProps) {
  const { data: authData } = authClient.useSession()

  return (
    <Surface as="header" borderRadius="none" className={styles.header}>
      <Button.Icon
        aria-controls="main-navigation"
        aria-expanded={isSidebarOpen}
        aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        onClick={onMenuClick}
        variant="ghost"
      >
        <MenuIcon />
      </Button.Icon>
      <SearchDialog />
      <Menu
        items={[
          {
            label: 'View account',
            icon: <UserIcon />,
          },
          {
            label: 'Sign out',
            icon: <SignOutIcon />,
          },
        ]}
        align="end"
      >
        <Button aria-label="User menu" size="small">
          <span className={styles.avatar}>
            {authData?.user.name.charAt(0).toUpperCase()}
          </span>
          <span>My Account</span>
          {/* <span>{authData?.user.name}</span> */}
        </Button>
      </Menu>
    </Surface>
  )
}
