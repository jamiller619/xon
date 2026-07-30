import { Flex, ScrollArea } from '@xon/ui'
import clsx from 'clsx'
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import AudioPlayer from '~/components/viewers/AudioPlayer'
import styles from './Layout.module.css'
import ScanBanner from './ScanBanner'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const toggleSidebar = () => {
    setSidebarOpen((open) => !open)
  }

  return (
    <Flex className={styles.shell}>
      <Sidebar
        className={clsx(styles.sidebar, sidebarOpen && styles.open)}
        isOpen={sidebarOpen}
      />
      <div className={styles.main}>
        <TopBar isSidebarOpen={sidebarOpen} onMenuClick={toggleSidebar} />
        <ScrollArea className={styles.content}>
          <Outlet />
        </ScrollArea>
      </div>
      <AudioPlayer />
      <ScanBanner />
    </Flex>
  )
}
