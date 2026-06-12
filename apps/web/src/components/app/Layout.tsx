import { Flex, ScrollArea } from '@xon/ui'
import clsx from 'clsx'
import { Outlet } from 'react-router-dom'
import AudioPlayer from '~/components/viewers/AudioPlayer'
import { useAppStore } from '~/store/appStore'
import { useAudioStore } from '~/store/audioStore'
import styles from './Layout.module.css'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function Layout() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)
  const hasQueue = useAudioStore((s) => s.queue.length > 0)

  return (
    <Flex>
      <Sidebar
        className={clsx(styles.sidebar, sidebarOpen && styles.open)}
        isOpen={sidebarOpen}
      />
      <div className={styles.main}>
        <TopBar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <ScrollArea
          className={`${styles.content}${hasQueue ? ` ${styles.contentWithPlayer}` : ''}`}
        >
          <Outlet />
        </ScrollArea>
      </div>
      <AudioPlayer />
    </Flex>
  )
}
