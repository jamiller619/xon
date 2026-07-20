import type { MediaItem } from '@xon/shared'
import Autoplay from 'embla-carousel-autoplay'
import Fade from 'embla-carousel-fade'
import useEmblaCarousel from 'embla-carousel-react'
import { type CSSProperties, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiUrl } from '~/lib/apiFetch'
import MovieSubtitle from '../media/movies/MovieSubtitle'
import styles from './FeaturedCarousel.module.css'

const AUTOPLAY_DELAY_MS = 18000

interface FeaturedCarouselProps {
  items?: MediaItem[] | undefined
}

function backdropUrl(item: MediaItem, appearance: number): string | undefined {
  const backdrop = item.metadata.images?.backdrop
  const list = Array.isArray(backdrop) ? backdrop : backdrop ? [backdrop] : []
  const url = list[appearance % list.length]
  return url ? apiUrl(url) : undefined
}

function mediaLink(item: MediaItem): string {
  return `/media/${encodeURIComponent(item.title.toLowerCase().replaceAll(' ', '-'))}/${item.id}`
}

export default function FeaturedCarousel({ items }: FeaturedCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, duration: 40 }, [
    Autoplay({
      delay: AUTOPLAY_DELAY_MS,
      stopOnInteraction: false,
      stopOnMouseEnter: true,
    }),
    Fade(),
  ])
  const [selectedIndex, setSelectedIndex] = useState(0)
  // Bumped when autoplay's timer restarts from zero without a slide change
  // (mouse leave), so the dot-fill animation remounts in sync
  const [cycleKey, setCycleKey] = useState(0)
  // Times each item has been shown; picks which of its backdrops to use so
  // repeat appearances cycle through them
  const [appearances, setAppearances] = useState<Record<string, number>>({})
  // Fade keeps every slide mounted, so <img loading="lazy"> can't help — the
  // browser treats them all as visible. Instead only fetch the current and
  // next slide's backdrop, plus whatever has already loaded, so a cold
  // dashboard load doesn't fetch every featured item's artwork up front.
  const [loadedIndexes, setLoadedIndexes] = useState<Set<number>>(
    () => new Set([0]),
  )

  useEffect(() => {
    if (!items || items.length === 0) return

    const nextIndex = (selectedIndex + 1) % items.length

    setLoadedIndexes((prev) => {
      if (prev.has(selectedIndex) && prev.has(nextIndex)) return prev
      return new Set(prev).add(selectedIndex).add(nextIndex)
    })
  }, [selectedIndex, items])

  useEffect(() => {
    if (!emblaApi) return

    let previousIndex = emblaApi.selectedScrollSnap()

    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap())

    // Advance the departed slide's backdrop only once it has fully faded
    // out, so the swap is never visible
    const onSettle = () => {
      const currentIndex = emblaApi.selectedScrollSnap()
      if (currentIndex === previousIndex) return

      const departed = items?.[previousIndex]
      previousIndex = currentIndex

      if (departed) {
        setAppearances((prev) => ({
          ...prev,
          [departed.id]: (prev[departed.id] ?? 0) + 1,
        }))
      }
    }

    emblaApi.on('select', onSelect)
    emblaApi.on('settle', onSettle)

    return () => {
      emblaApi.off('select', onSelect)
      emblaApi.off('settle', onSettle)
    }
  }, [emblaApi, items])

  if (!items || items.length === 0) return null

  return (
    <section
      className={styles.carousel}
      ref={emblaRef}
      aria-label="Featured"
      style={{ '--autoplay-delay': `${AUTOPLAY_DELAY_MS}ms` } as CSSProperties}
      // Leaving the carousel restarts autoplay's full delay; restart the
      // dot-fill with it
      onMouseLeave={() => setCycleKey((key) => key + 1)}
    >
      <div className={styles.container}>
        {items.map((item, index) => {
          const backdrop = backdropUrl(item, appearances[item.id] ?? 0)

          return (
            <Link
              key={item.id}
              to={mediaLink(item)}
              state={item}
              className={styles.slide}
            >
              {backdrop && loadedIndexes.has(index) && (
                <img
                  src={backdrop}
                  alt=""
                  className={styles.backdrop}
                  decoding="async"
                  {...(index === 0 ? { fetchPriority: 'high' } : {})}
                />
              )}
              <span className={styles.scrim} />
              <div className={styles.info}>
                <span className={styles.eyebrow}>Featured</span>
                <h2 className={styles.title}>{item.title}</h2>
                <MovieSubtitle data={item} />
                {(item.description ?? item.metadata.overview) && (
                  <p className={styles.overview}>
                    {item.description ?? item.metadata.overview}
                  </p>
                )}
              </div>
            </Link>
          )
        })}
      </div>
      <div className={styles.dots}>
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            aria-label={`Show ${item.title}`}
            className={
              index === selectedIndex
                ? `${styles.dot} ${styles.dotActive}`
                : styles.dot
            }
            onClick={() => emblaApi?.scrollTo(index)}
          >
            {index === selectedIndex && (
              <span
                key={`${selectedIndex}-${cycleKey}`}
                className={styles.dotProgress}
              />
            )}
          </button>
        ))}
      </div>
    </section>
  )
}
