import {
  type FluentIconsProps,
  MoviesAndTv20Regular as MoviesIcon,
  MoviesAndTv20Filled as MoviesIconFilled,
  MoviesAndTv24Regular as MoviesIconLarge,
  MusicNote220Regular as MusicIcon,
  MusicNote220Filled as MusicIconFilled,
  MusicNote224Regular as MusicIconLarge,
  Image20Regular as PhotosIcon,
  Image20Filled as PhotosIconFilled,
  Image24Regular as PhotosIconLarge,
  TvRegular as TVIcon,
  TvFilled as TVIconFilled,
  Tv24Regular as TVIconLarge,
} from '@fluentui/react-icons'
import type { ContentType } from '@xon/shared'

type LibraryIconProps = FluentIconsProps & {
  type?: ContentType | undefined
  size?: 'small' | 'large'
  filled?: boolean
}

export default function LibraryIcon({
  type,
  size = 'small',
  filled = false,
  ...props
}: LibraryIconProps) {
  switch (type) {
    case 'video/movie':
      return size === 'large' ? (
        <MoviesIconLarge {...props} />
      ) : filled ? (
        <MoviesIconFilled {...props} />
      ) : (
        <MoviesIcon {...props} />
      )
    case 'video/tvshow':
    case 'video':
      return size === 'large' ? (
        <TVIconLarge {...props} />
      ) : filled ? (
        <TVIconFilled {...props} />
      ) : (
        <TVIcon {...props} />
      )
    case 'audio':
      return size === 'large' ? (
        <MusicIconLarge {...props} />
      ) : filled ? (
        <MusicIconFilled {...props} />
      ) : (
        <MusicIcon {...props} />
      )
    case 'image':
      return size === 'large' ? (
        <PhotosIconLarge {...props} />
      ) : filled ? (
        <PhotosIconFilled {...props} />
      ) : (
        <PhotosIcon {...props} />
      )
  }
}
