import { ExifTool } from 'exiftool-vendored'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

// @ts-expect-error: TypeScript expects ffmpeg-static to
// have a default export, but it doensn't.
export const ffmpegPath: string = ffmpegStatic ?? 'ffmpeg'
export const ffprobePath: string = ffprobeStatic.path

export const exifTool = new ExifTool({ taskTimeoutMillis: 10_000 })

process.on('exit', () => {
  void exifTool.end()
})
