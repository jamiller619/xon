import {
  Calendar16Regular as CalendarIcon,
  Clock16Regular as ClockIcon,
  Star16Filled as StarIcon,
} from '@fluentui/react-icons'
import type { MediaItem } from '@xon/shared'
import { Chip, Flex } from '@xon/ui'
import useMetadata from '~/hooks/useMetadata'
import { mediaGenres } from '~/lib/mediaMetadata'
import Resolution from '../components/Resolution'
import styles from '../Media.module.css'
import * as icons from './icons'

export default function MovieSubtitle({ data }: { data: MediaItem }) {
  const genres = mediaGenres(data)
  const rottenTomatoes = data.metadata.rottenTomatoesRating
  const rtFresh = rottenTomatoes >= 60
  const metascore = data.metadata.metascore
  const imdbRating = data.metadata.imdbRating
  const rating = data.metadata.rated
  const year = useMetadata(data, 'year')
  const duration = useMetadata(data, 'duration')

  return (
    <>
      {year && (
        <Flex gap="1" align="center">
          <CalendarIcon />
          <span>{year}</span>
        </Flex>
      )}
      {rating && <Chip variant="ghost">{rating}</Chip>}
      {genres && genres.length > 0 && (
        <span>{genres.slice(0, 3).join(' · ')}</span>
      )}
      {data.fileMetadata.resolution && (
        <Chip className={styles.resolution}>
          <Resolution
            height={data.fileMetadata.resolution.height}
            width={data.fileMetadata.resolution.width}
            layout="$n $a"
          />
        </Chip>
      )}
      <Flex gap="1" align="center">
        <ClockIcon />
        <span>{duration}</span>
      </Flex>
      {data.metadata.voteAverage && (
        <Flex gap="1" align="center">
          <StarIcon className={styles.ratingIcon as string} />
          <span>{data.metadata.voteAverage.toFixed(1)}</span>
        </Flex>
      )}
      {rottenTomatoes && (
        <Flex align="center">
          {rtFresh ? <icons.RottenTomatoes /> : <icons.RottenTomatoesRotten />}
          <span className={styles.rottenTomatoes}>{rottenTomatoes}%</span>
        </Flex>
      )}
      {metascore && (
        <Flex align="center">
          <icons.Metascore />
          <span className={styles.metascore}>{metascore}</span>
        </Flex>
      )}
      {imdbRating && (
        <Flex gap="1" align="center">
          <icons.IMDb />
          <span className={styles.imdbRating}>{imdbRating}</span>
        </Flex>
      )}
    </>
  )
}
