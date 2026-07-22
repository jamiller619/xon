import { Flex, ScrollArea } from '@xon/ui'
import clsx from 'clsx'
import { Outlet } from 'react-router-dom'
import AudioPlayer from '~/components/viewers/AudioPlayer'
import { useAppStore } from '~/store/appStore'
import styles from './Layout.module.css'
import ScanBanner from './ScanBanner'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function Layout() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)

  return (
    <Flex className={styles.shell}>
      <Sidebar
        className={clsx(styles.sidebar, sidebarOpen && styles.open)}
        isOpen={sidebarOpen}
      />
      <div className={styles.main}>
        <TopBar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <ScrollArea className={styles.content}>
          <Outlet />
        </ScrollArea>
      </div>
      <AudioPlayer />
      <ScanBanner />
    </Flex>
  )
}
