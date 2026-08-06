import { type Library, LibraryType } from '@xon/shared'
import type { ComponentType } from 'react'
import HomeVideosLibraryView from './views/home-videos/HomeVideosLibraryView'
import MoviesLibraryView from './views/movies/MoviesLibraryView'
import MusicLibraryView from './views/music/MusicLibraryView'
import MusicVideosLibraryView from './views/music-videos/MusicVideosLibraryView'
import PhotosLibraryView from './views/photos/PhotosLibraryView'
import TVShowsLibraryView from './views/tv-shows/TVShowsLibraryView'

export type LibraryTypeViewProps = {
  library: Library
}

export const LIBRARY_TYPE_VIEWS = {
  [LibraryType.Movies]: MoviesLibraryView,
  [LibraryType.TVShows]: TVShowsLibraryView,
  [LibraryType.Music]: MusicLibraryView,
  [LibraryType.Photos]: PhotosLibraryView,
  [LibraryType.HomeVideos]: HomeVideosLibraryView,
  [LibraryType.MusicVideos]: MusicVideosLibraryView,
} satisfies Record<LibraryType, ComponentType<LibraryTypeViewProps>>
