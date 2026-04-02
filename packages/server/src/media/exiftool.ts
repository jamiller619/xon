import { spawn } from 'node:child_process'
import { MediaCategory } from '@xon/shared'

const IMAGE_CATEGORIES = new Set<string>([
  MediaCategory.Pictures,
  MediaCategory.Images,
  MediaCategory.DesignFiles,
])

export type ExiftoolMetadata = {
  width?: number
  height?: number
  colorSpace?: string
  cameraModel?: string
  gpsLatitude?: number
  gpsLongitude?: number
  dateTaken?: string
  orientation?: string
}

export function isImageCategory(category: string | null): boolean {
  if (!category) return false
  return IMAGE_CATEGORIES.has(category)
}

export async function extractExiftoolMetadata(
  filePath: string,
): Promise<ExiftoolMetadata | null> {
  return new Promise((resolve) => {
    let stdout = ''

    const proc = spawn('exiftool', ['-json', '-n', filePath])

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    proc.on('error', (err: Error) => {
      console.error(`ExifTool not available: ${err.message}`)
      resolve(null)
    })

    proc.on('close', (code: number | null) => {
      if (code !== 0) {
        console.error(
          `ExifTool exited with code ${String(code)} for ${filePath}`,
        )
        resolve(null)
        return
      }

      try {
        const parsed = JSON.parse(stdout) as Record<string, unknown>[]
        const data = parsed[0]
        if (!data) {
          resolve({})
          return
        }

        const result: ExiftoolMetadata = {}

        const w = Number(data.ImageWidth)
        if (!Number.isNaN(w) && w > 0) result.width = w

        const h = Number(data.ImageHeight)
        if (!Number.isNaN(h) && h > 0) result.height = h

        const colorSpace = data.ColorSpace ?? data.ColorSpaceData
        if (typeof colorSpace === 'string') result.colorSpace = colorSpace

        const model = data.Model ?? data.CameraModelName
        if (typeof model === 'string') result.cameraModel = model

        const lat = Number(data.GPSLatitude)
        if (!Number.isNaN(lat) && data.GPSLatitude !== undefined)
          result.gpsLatitude = lat

        const lon = Number(data.GPSLongitude)
        if (!Number.isNaN(lon) && data.GPSLongitude !== undefined)
          result.gpsLongitude = lon

        const dateTaken = data.DateTimeOriginal ?? data.CreateDate
        if (typeof dateTaken === 'string') result.dateTaken = dateTaken

        const orientation = data.Orientation
        if (
          typeof orientation === 'string' ||
          typeof orientation === 'number'
        ) {
          result.orientation = String(orientation)
        }

        resolve(result)
      } catch {
        console.error(`ExifTool JSON parse error for ${filePath}`)
        resolve(null)
      }
    })
  })
}
