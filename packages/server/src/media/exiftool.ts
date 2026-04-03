import { MediaCategory } from '@xon/shared'
import { exifTool } from './binaries.js'

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
  try {
    const tags = await exifTool.read(filePath)

    const result: ExiftoolMetadata = {}

    if (tags.ImageWidth) result.width = tags.ImageWidth
    if (tags.ImageHeight) result.height = tags.ImageHeight
    if (tags.ColorSpace) result.colorSpace = String(tags.ColorSpace)
    const model = tags.Model ?? tags.CameraModel
    if (model) result.cameraModel = String(model)
    if (tags.GPSLatitude != null) result.gpsLatitude = Number(tags.GPSLatitude)
    if (tags.GPSLongitude != null)
      result.gpsLongitude = Number(tags.GPSLongitude)
    const dateTaken = tags.DateTimeOriginal ?? tags.CreateDate
    if (dateTaken) result.dateTaken = String(dateTaken)
    if (tags.Orientation != null) result.orientation = String(tags.Orientation)

    return result
  } catch (err) {
    console.error(`ExifTool error for ${filePath}:`, err)
    return null
  }
}
