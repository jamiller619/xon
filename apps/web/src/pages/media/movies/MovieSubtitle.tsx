import {
  Calendar16Regular as CalendarIcon,
  Clock16Regular as ClockIcon,
  Star16Filled as StarIcon,
} from '@fluentui/react-icons'
import type { MediaItem } from '@xon/shared'
import { Badge, Flex } from '@xon/ui'
import Resolution from '../components/Resolution'
import styles from '../Media.module.css'
import * as icons from './icons'

export default function MovieSubtitle({ data }: { data: MediaItem }) {
  const genres = data.metadata.genres ?? []
  const rottenTomatoes = data.metadata.rottenTomatoesRating
  const metascore = data.metadata.metascore
  const imdbRating = data.metadata.imdbRating
  const rating = data.metadata.rated
  const year = parseYear(data)

  return (
    <>
      <Flex gap="4" className={styles.subtitle} align="center">
        {year && (
          <Flex gap="1" align="center">
            <CalendarIcon />
            <span>{year}</span>
          </Flex>
        )}
        {rating && <Badge variant="ghost">{rating}</Badge>}
        {data.fileMetadata.resolution && (
          <Badge variant="primary">
            <Resolution
              height={data.fileMetadata.resolution.height}
              width={data.fileMetadata.resolution.width}
              layout="$n $a"
            />
          </Badge>
        )}
        <Flex gap="1" align="center">
          <ClockIcon />
          <span>{parseDuration(data.fileMetadata.duration * 1000)}</span>
        </Flex>
        {genres && genres.length > 0 && (
          <span>{genres.slice(0, 3).join(' · ')}</span>
        )}
      </Flex>
      <Flex gap="4" className={styles.subtitle} align="center">
        {data.metadata.voteAverage && (
          <Flex gap="1" align="center">
            <StarIcon className={styles.ratingIcon as string} />
            <span>{data.metadata.voteAverage.toFixed(1)}</span>
          </Flex>
        )}
        {rottenTomatoes && (
          <Flex align="center">
            <icons.RottenTomatoes />
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
      </Flex>
    </>
  )
}

function parseYear(data: MediaItem) {
  if ('releaseDate' in data.metadata) {
    if (data.metadata.releaseDate.length > 4) {
      return new Date(data.metadata.releaseDate).getFullYear()
    }

    return data.metadata.releaseDate
  }
}

function parseDuration(value?: number) {
  if (!value) return null

  const totalSeconds = Math.round(value / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = hours > 0 ? 0 : totalSeconds % 60

  return new Intl.DurationFormat(undefined, { style: 'narrow' }).format({
    hours,
    minutes,
    seconds,
  })
}
