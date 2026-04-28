import clsx from 'clsx'
import { useEffect, useState } from 'react'
import ReactGridLayout, { useContainerWidth } from 'react-grid-layout'
import { Link } from 'react-router-dom'
import PluginSlot from '~/components/PluginSlot'
import MediaCard, {
  type MediaCardItem,
} from '~/components/media-card/MediaCard'
import { apiFetch } from '~/lib/apiFetch'
import styles from './Dashboard.module.css'

interface Library {
  id: string
  name: string
}

export default function Dashboard() {
  const [recentMedia, setRecentMedia] = useState<MediaCardItem[]>([])
  const [libraries, setLibraries] = useState<Library[]>([])
  const [libraryMedia, setLibraryMedia] = useState<
    Record<string, MediaCardItem[]>
  >({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      const [mediaRes, libsRes] = await Promise.all([
        apiFetch('/api/v1/media?order=desc&limit=20'),
        apiFetch('/api/v1/libraries'),
      ])
      const [media, libs] = await Promise.all([
        mediaRes.json() as Promise<MediaCardItem[]>,
        libsRes.json() as Promise<Library[]>,
      ])

      setRecentMedia(media)
      setLibraries(libs)

      const entries = await Promise.all(
        libs.map(async (lib) => {
          const res = await apiFetch(
            `/api/v1/libraries/${lib.id}/media?order=desc&limit=8`,
          )
          const items = (await res.json()) as MediaCardItem[]
          return [lib.id, items] as const
        }),
      )
      setLibraryMedia(Object.fromEntries(entries))
      setLoading(false)
    }

    fetchData().catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className={styles.loading ?? ''}>
        <p>Loading…</p>
      </div>
    )
  }

  return (
    <div className={styles.dashboard}>
      <PluginSlot injectionPoint="dashboard-widget" />
      {/* {mounted && (
        <ReactGridLayout
          layout={layout}
          width={width}
          gridConfig={{ cols: 12, rowHeight: 220 }}
        > */}
      <section key="featured" className={clsx(styles.section, styles.featured)}>
        test
      </section>
      <section key="a" className={clsx(styles.section, styles.cards)}>
        <h2 className={styles.sectionTitle}>Continue Watching</h2>
        <p className={styles.emptyHint}>Nothing in progress yet.</p>
      </section>
      <section key="b" className={styles.section}>
        <h2 className={styles.sectionTitle}>Recently Added</h2>
        {recentMedia.length === 0 ? (
          <p className={styles.emptyHint}>
            No media yet.{' '}
            <Link to="/admin/libraries" className={styles.emptyLink}>
              Add a library
            </Link>{' '}
            to get started.
          </p>
        ) : (
          <div className={styles.cards}>
            {recentMedia.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
      <section key="c" className={styles.section}>
        another
      </section>
      `{/* </ReactGridLayout> */}
      {/* )} */}
      {/* {libraries.map((lib) => {
        const items = libraryMedia[lib.id] ?? []
        return (
          <section key={lib.id} className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{lib.name}</h2>
              <Link to={`/libraries/${lib.id}`} className={styles.seeAll}>
                See all
              </Link>
            </div>
            {items.length === 0 ? (
              <p className={styles.emptyHint}>No media in this library.</p>
            ) : (
              <div className={styles.grid}>
                {items.map((item) => (
                  <MediaCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>
        )
      })} */}
    </div>
  )
}
