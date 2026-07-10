import { LibraryType } from '@xon/shared'

export function classifyByRules(filePath: string) {
  const name = filePath.toLowerCase()

  if (/\bs\d{1,2}e\d{1,2}\b/i.test(name)) return LibraryType.TVShows
  if (/\b\d{1,2}x\d{1,2}\b/i.test(name)) return LibraryType.TVShows

  if (/\.(mp3|flac|m4a|wav|aac|ogg)$/i.test(name)) return LibraryType.Music

  if (/\.(jpg|jpeg|png|heic|webp|cr2|nef|arw)$/i.test(name))
    return LibraryType.Photos

  if (/\.(mkv|mp4|avi|mov|wmv)$/i.test(name)) {
    if (/\b(19|20)\d{2}\b/.test(name)) return LibraryType.Movies
    return LibraryType.HomeVideos
  }

  return undefined
}
