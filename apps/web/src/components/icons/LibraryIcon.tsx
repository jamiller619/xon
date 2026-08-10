import {
  type FluentIconsProps,
  MoviesAndTv20Regular as MoviesIcon,
  MoviesAndTv24Regular as MoviesIconLarge,
  MusicNote2Regular as MusicIcon,
  MusicNote224Regular as MusicIconLarge,
  Image20Regular as PhotosIcon,
  Image24Regular as PhotosIconLarge,
  TvRegular as TVIcon,
  Tv24Regular as TVIconLarge,
} from '@fluentui/react-icons'
import type { ContentType } from '@xon/shared'

type LibraryIconProps = FluentIconsProps & {
  type?: ContentType | undefined
  size?: 'small' | 'large'
}

export default function LibraryIcon({
  type,
  size = 'small',
  ...props
}: LibraryIconProps) {
  switch (type) {
    case 'video/movie':
      return size === 'large' ? (
        <MoviesIconLarge {...props} />
      ) : (
        <MoviesIcon {...props} />
      )
    case 'video/tvshow':
    case 'video':
      return size === 'large' ? (
        <TVIconLarge {...props} />
      ) : (
        <TVIcon {...props} />
      )
    case 'audio':
      return size === 'large' ? (
        <MusicIconLarge {...props} />
      ) : (
        <MusicIcon {...props} />
      )
    case 'image':
      return size === 'large' ? (
        <PhotosIconLarge {...props} />
      ) : (
        <PhotosIcon {...props} />
      )
  }
}
