import { Button, Flex } from '@xon/ui'
import clsx from 'clsx'
import Icons from '~/components/icons/icons'
import { useAudioStore } from '~/store/audioStore'
import { PauseIcon, PlayIcon } from '../icons/playback'
import styles from './AudioPlayer.module.css'

export default function AudioQueuePanel() {
  const queue = useAudioStore((state) => state.queue)
  const currentIndex = useAudioStore((state) => state.currentIndex)
  const playing = useAudioStore((state) => state.playing)
  const playAtIndex = useAudioStore((state) => state.playAtIndex)
  const removeFromQueue = useAudioStore((state) => state.removeFromQueue)
  const setPlaying = useAudioStore((state) => state.setPlaying)
  const clearQueue = useAudioStore((state) => state.clearQueue)
  const moveUp = useAudioStore((state) => state.moveUp)
  const moveDown = useAudioStore((state) => state.moveDown)

  return (
    <Flex dir="col" className={styles.queuePanel}>
      <Flex justify="between" align="center" className={styles.queueHeader}>
        <span className={styles.queueTitle}>Queue ({queue.length})</span>
        <Flex gap="2">
          <Button variant="ghost" onClick={clearQueue} size="small">
            <Icons.Delete />
            Clear all
          </Button>
          <Button onClick={() => console.log('Save to playlist')} size="small">
            <Icons.Delete />
            Save to playlist
          </Button>
        </Flex>
      </Flex>
      <ul className={styles.queueList}>
        {queue.map((item, index) => {
          const isPlaying = playing && index === currentIndex

          return (
            <li
              key={item.id}
              className={clsx(
                styles.queueItem,
                isPlaying && styles.queueItemActive,
              )}
              aria-current={isPlaying ? 'true' : undefined}
            >
              <button
                type="button"
                className={styles.queueItemButton}
                onClick={() =>
                  isPlaying ? setPlaying(false) : playAtIndex(index)
                }
              >
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
                <span className={styles.queueItemTitle}>{item.title}</span>
              </button>
              <Flex className={styles.queueItemActions}>
                <button
                  type="button"
                  className={styles.queueMoveBtn}
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  aria-label={`Move ${item.title} up`}
                >
                  <span aria-hidden="true">↑</span>
                </button>
                <button
                  type="button"
                  className={styles.queueMoveBtn}
                  onClick={() => moveDown(index)}
                  disabled={index === queue.length - 1}
                  aria-label={`Move ${item.title} down`}
                >
                  <span aria-hidden="true">↓</span>
                </button>
                <button
                  type="button"
                  className={styles.queueRemoveBtn}
                  onClick={() => removeFromQueue(index)}
                  aria-label={`Remove ${item.title} from queue`}
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </Flex>
            </li>
          )
        })}
      </ul>
    </Flex>
  )
}
