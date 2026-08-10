import type { ContentType, Library } from '@xon/shared'
import type { ComponentType } from 'react'
import MoviesLibraryView from './views/movies/MoviesLibraryView'
import MusicLibraryView from './views/music/MusicLibraryView'
import PhotosLibraryView from './views/photos/PhotosLibraryView'
import TVShowsLibraryView from './views/tv-shows/TVShowsLibraryView'
import HomeVideosLibraryView from './views/videos/HomeVideosLibraryView'

export type LibraryTypeViewProps = {
  library: Library
}

export const LIBRARY_TYPE_VIEWS = {
  'video/movie': MoviesLibraryView,
  'video/tvshow': TVShowsLibraryView,
  audio: MusicLibraryView,
  image: PhotosLibraryView,
  video: HomeVideosLibraryView,
} satisfies Partial<Record<ContentType, ComponentType<LibraryTypeViewProps>>>
