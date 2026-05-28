import type { FileEntry } from './fileEntry.ts'

export type ScanResult = {
  discovered: FileEntry[]
  newFiles: FileEntry[]
  changedFiles: FileEntry[]
  removedFilePaths: string[]
}

// Converts a Windows-style path to its WSL mount equivalent.
// E:\foo\bar → /mnt/e/foo/bar
// No-op for paths that are already Linux-style.
export function toLocalPath(inputPath: string): string {
  const match = /^([A-Za-z]):[/\\](.*)$/.exec(inputPath)
  if (match) {
    const drive = match[1]?.toLowerCase()
    const rest = match[2]?.replace(/\\/g, '/')
    return `/mnt/${drive}/${rest}`
  }
  return inputPath
}
