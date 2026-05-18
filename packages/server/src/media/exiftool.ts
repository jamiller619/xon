import { CATEGORY_DEFINITIONS, MediaCategory } from '@xon/shared'
import { createLogger } from '../logger.js'
import { exifTool } from './binaries.js'

const logger = createLogger('exiftool')

const IMAGE_CATEGORIES = new Set<string>([
  MediaCategory.Pictures,
  // MediaCategory.Images,
  // MediaCategory.DesignFiles,
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

const IMAGE_MIME_TYPES = new Set<string>(
  ...Object.values(CATEGORY_DEFINITIONS[MediaCategory.Pictures]),
)

export function isImage(mimeType: string | null): boolean {
  if (!mimeType) return false

  return IMAGE_MIME_TYPES.has(mimeType)
}

export function isImageCategory(...categories: string[]): boolean {
  if (!categories.length) return false

  return categories.some((c) => IMAGE_CATEGORIES.has(c))
}

export async function extractExiftoolMetadata(
  filePath: string,
): Promise<ExiftoolMetadata | null> {
  logger.debug(`Extracting metadata: ${filePath}`)

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

    logger.debug(`Metadata extracted: ${filePath}`, {
      width: result.width,
      height: result.height,
      cameraModel: result.cameraModel,
      hasGps: result.gpsLatitude != null,
    })

    return result
  } catch (err) {
    logger.error('ExifTool error', { filePath, error: err })
    return null
  }
}
