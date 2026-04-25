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
    <div className={styles.shell}>
      <Sidebar
        open={sidebarOpen}
        onMenuClick={() => setSidebarOpen(!sidebarOpen)}
      />
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: <explanation> */}
      <div
        className={`${styles.overlay}${sidebarOpen ? ` ${styles.visible}` : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <div className={styles.main}>
        <TopBar />
        <main
          className={`${styles.content}${hasQueue ? ` ${styles.contentWithPlayer}` : ''}`}
        >
          <Outlet />
        </main>
      </div>
      <AudioPlayer />
    </div>
  )
}
