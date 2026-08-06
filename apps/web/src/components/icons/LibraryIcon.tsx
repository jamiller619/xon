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
import { LibraryType } from '@xon/shared'

type LibraryIconProps = FluentIconsProps & {
  type?: LibraryType | undefined
  size?: 'small' | 'large'
}

export default function LibraryIcon({
  type,
  size = 'small',
  ...props
}: LibraryIconProps) {
  switch (type) {
    case LibraryType.Movies:
      return size === 'large' ? (
        <MoviesIconLarge {...props} />
      ) : (
        <MoviesIcon {...props} />
      )
    case LibraryType.TVShows:
    case LibraryType.HomeVideos:
      return size === 'large' ? (
        <TVIconLarge {...props} />
      ) : (
        <TVIcon {...props} />
      )
    case LibraryType.Music:
    case LibraryType.MusicVideos:
      return size === 'large' ? (
        <MusicIconLarge {...props} />
      ) : (
        <MusicIcon {...props} />
      )
    case LibraryType.Photos:
      return size === 'large' ? (
        <PhotosIconLarge {...props} />
      ) : (
        <PhotosIcon {...props} />
      )
  }
}
