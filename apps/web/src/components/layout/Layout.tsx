import { Outlet } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { useAudioStore } from '../../store/audioStore'
import AudioPlayer from '../viewers/AudioPlayer'
import styles from './Layout.module.css'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function Layout() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)
  const hasQueue = useAudioStore((s) => s.queue.length > 0)

  return (
    <div className={styles.shell ?? ''}>
      <Sidebar open={sidebarOpen} />
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: overlay is aria-hidden, not keyboard navigable */}
      <div
        className={`${styles.overlay ?? ''}${sidebarOpen ? ` ${styles.visible ?? ''}` : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <div className={styles.main ?? ''}>
        <TopBar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <main
          className={`${styles.content ?? ''}${hasQueue ? ` ${styles.contentWithPlayer ?? ''}` : ''}`}
        >
          <Outlet />
        </main>
      </div>
      <AudioPlayer />
    </div>
  )
}
