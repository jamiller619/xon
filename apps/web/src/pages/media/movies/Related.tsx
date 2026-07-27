import { useQuery } from '@tanstack/react-query'
import type { MediaItem } from '@xon/shared'
import { Flex, XScroller } from '@xon/ui'
import { css } from 'inline-css-modules'
import MediaCard from '~/components/media-card/MediaCard'
import useQueryAPIHelper from '~/hooks/useQueryAPIHelper'
import mediaStyles from '../Media.module.css'

const styles = css`
  .relatedList {
    gap: var(--space-md);

    /* Cards query this container to size themselves against the visible
       shelf width (see MediaCard.module.css). */
    container-type: inline-size;
    container-name: row;
  }
`

export default function Related({ id }: { id: string }) {
  const { data } = useQuery<MediaItem[]>(
    useQueryAPIHelper('relatedMedia', { id }),
  )

  if (!data || data.length === 0) return null

  return (
    <XScroller>
      <Flex dir="col" gap="4">
        <Flex justify="between" align="center">
          <h2 className={mediaStyles.heading}>Related</h2>
          <Flex gap="4">
            <XScroller.ButtonPrev />
            <XScroller.ButtonNext />
          </Flex>
        </Flex>
        <XScroller.Viewport className={styles.relatedList}>
          {data.map((item) => (
            <MediaCard key={item.id} item={item} />
          ))}
        </XScroller.Viewport>
      </Flex>
    </XScroller>
  )
}
