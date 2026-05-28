export function isAudio(mimeType?: string): boolean {
  return mimeType?.startsWith('audio/') ?? false
}

export function isVideo(mimeType?: string): boolean {
  return mimeType?.startsWith('video/') ?? false
}

export function isImage(mimeType?: string): boolean {
  return mimeType?.startsWith('image/') ?? false
}
