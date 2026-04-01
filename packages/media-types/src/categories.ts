import { MediaCategory } from '@xon/shared'

export type MediaCategoryInfo = {
  extensions: string[]
  mimeTypes: Record<string, string>
}

/**
 * Definitions for each media category: supported file extensions and their MIME types.
 * Extensions are lowercase and include the leading dot (e.g., ".mp4").
 */
export const CATEGORY_DEFINITIONS: Record<MediaCategory, MediaCategoryInfo> = {
  [MediaCategory.Movies]: {
    extensions: [
      '.mp4',
      '.mkv',
      '.avi',
      '.mov',
      '.wmv',
      '.m4v',
      '.flv',
      '.webm',
      '.mpg',
      '.mpeg',
      '.ts',
      '.3gp',
      '.ogv',
    ],
    mimeTypes: {
      '.mp4': 'video/mp4',
      '.mkv': 'video/x-matroska',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.wmv': 'video/x-ms-wmv',
      '.m4v': 'video/x-m4v',
      '.flv': 'video/x-flv',
      '.webm': 'video/webm',
      '.mpg': 'video/mpeg',
      '.mpeg': 'video/mpeg',
      '.ts': 'video/mp2t',
      '.3gp': 'video/3gpp',
      '.ogv': 'video/ogg',
    },
  },
  [MediaCategory.TVShows]: {
    extensions: [
      '.mp4',
      '.mkv',
      '.avi',
      '.mov',
      '.wmv',
      '.m4v',
      '.webm',
      '.mpg',
      '.mpeg',
      '.ogv',
    ],
    mimeTypes: {
      '.mp4': 'video/mp4',
      '.mkv': 'video/x-matroska',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.wmv': 'video/x-ms-wmv',
      '.m4v': 'video/x-m4v',
      '.webm': 'video/webm',
      '.mpg': 'video/mpeg',
      '.mpeg': 'video/mpeg',
      '.ogv': 'video/ogg',
    },
  },
  [MediaCategory.Clips]: {
    extensions: ['.mp4', '.mkv', '.mov', '.webm', '.avi', '.gif'],
    mimeTypes: {
      '.mp4': 'video/mp4',
      '.mkv': 'video/x-matroska',
      '.mov': 'video/quicktime',
      '.webm': 'video/webm',
      '.avi': 'video/x-msvideo',
      '.gif': 'image/gif',
    },
  },
  [MediaCategory.Music]: {
    extensions: [
      '.mp3',
      '.flac',
      '.wav',
      '.aac',
      '.ogg',
      '.m4a',
      '.wma',
      '.opus',
      '.aiff',
      '.aif',
    ],
    mimeTypes: {
      '.mp3': 'audio/mpeg',
      '.flac': 'audio/flac',
      '.wav': 'audio/wav',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.wma': 'audio/x-ms-wma',
      '.opus': 'audio/opus',
      '.aiff': 'audio/aiff',
      '.aif': 'audio/aiff',
    },
  },
  [MediaCategory.Audiobooks]: {
    extensions: ['.m4b', '.mp3', '.flac', '.ogg', '.opus', '.aac'],
    mimeTypes: {
      '.m4b': 'audio/mp4',
      '.mp3': 'audio/mpeg',
      '.flac': 'audio/flac',
      '.ogg': 'audio/ogg',
      '.opus': 'audio/opus',
      '.aac': 'audio/aac',
    },
  },
  [MediaCategory.AudioClips]: {
    extensions: ['.mp3', '.wav', '.aac', '.ogg', '.flac', '.opus'],
    mimeTypes: {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg',
      '.flac': 'audio/flac',
      '.opus': 'audio/opus',
    },
  },
  [MediaCategory.Podcasts]: {
    extensions: ['.mp3', '.m4a', '.ogg', '.opus', '.aac'],
    mimeTypes: {
      '.mp3': 'audio/mpeg',
      '.m4a': 'audio/mp4',
      '.ogg': 'audio/ogg',
      '.opus': 'audio/opus',
      '.aac': 'audio/aac',
    },
  },
  [MediaCategory.Pictures]: {
    extensions: [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.bmp',
      '.tiff',
      '.tif',
      '.webp',
      '.heic',
      '.heif',
      '.avif',
      '.cr2',
      '.cr3',
      '.nef',
      '.arw',
      '.dng',
      '.orf',
      '.raf',
    ],
    mimeTypes: {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.tiff': 'image/tiff',
      '.tif': 'image/tiff',
      '.webp': 'image/webp',
      '.heic': 'image/heic',
      '.heif': 'image/heif',
      '.avif': 'image/avif',
      '.cr2': 'image/x-canon-cr2',
      '.cr3': 'image/x-canon-cr3',
      '.nef': 'image/x-nikon-nef',
      '.arw': 'image/x-sony-arw',
      '.dng': 'image/x-adobe-dng',
      '.orf': 'image/x-olympus-orf',
      '.raf': 'image/x-fujifilm-raf',
    },
  },
  [MediaCategory.Images]: {
    extensions: [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.bmp',
      '.tiff',
      '.tif',
      '.webp',
      '.heic',
      '.svg',
      '.avif',
    ],
    mimeTypes: {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.tiff': 'image/tiff',
      '.tif': 'image/tiff',
      '.webp': 'image/webp',
      '.heic': 'image/heic',
      '.svg': 'image/svg+xml',
      '.avif': 'image/avif',
    },
  },
  [MediaCategory.Textures]: {
    extensions: [
      '.png',
      '.jpg',
      '.jpeg',
      '.tga',
      '.dds',
      '.hdr',
      '.exr',
      '.bmp',
      '.tiff',
    ],
    mimeTypes: {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.tga': 'image/x-tga',
      '.dds': 'image/vnd.ms-dds',
      '.hdr': 'image/vnd.radiance',
      '.exr': 'image/x-exr',
      '.bmp': 'image/bmp',
      '.tiff': 'image/tiff',
    },
  },
  [MediaCategory.HomeVideos]: {
    extensions: [
      '.mp4',
      '.mov',
      '.avi',
      '.wmv',
      '.3gp',
      '.mkv',
      '.m4v',
      '.webm',
    ],
    mimeTypes: {
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.wmv': 'video/x-ms-wmv',
      '.3gp': 'video/3gpp',
      '.mkv': 'video/x-matroska',
      '.m4v': 'video/x-m4v',
      '.webm': 'video/webm',
    },
  },
  [MediaCategory.Games]: {
    extensions: [
      '.iso',
      '.rom',
      '.bin',
      '.nsp',
      '.xci',
      '.gba',
      '.nds',
      '.nes',
      '.sfc',
      '.smc',
      '.z64',
      '.n64',
    ],
    mimeTypes: {
      '.iso': 'application/x-iso9660-image',
      '.rom': 'application/octet-stream',
      '.bin': 'application/octet-stream',
      '.nsp': 'application/octet-stream',
      '.xci': 'application/octet-stream',
      '.gba': 'application/octet-stream',
      '.nds': 'application/octet-stream',
      '.nes': 'application/octet-stream',
      '.sfc': 'application/octet-stream',
      '.smc': 'application/octet-stream',
      '.z64': 'application/octet-stream',
      '.n64': 'application/octet-stream',
    },
  },
  [MediaCategory.InteractiveMedia]: {
    extensions: ['.html', '.htm', '.swf', '.unity3d'],
    mimeTypes: {
      '.html': 'text/html',
      '.htm': 'text/html',
      '.swf': 'application/x-shockwave-flash',
      '.unity3d': 'application/vnd.unity',
    },
  },
  [MediaCategory.Documents]: {
    extensions: [
      '.pdf',
      '.doc',
      '.docx',
      '.txt',
      '.md',
      '.odt',
      '.rtf',
      '.epub',
      '.xls',
      '.xlsx',
      '.ppt',
      '.pptx',
      '.csv',
    ],
    mimeTypes: {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.odt': 'application/vnd.oasis.opendocument.text',
      '.rtf': 'application/rtf',
      '.epub': 'application/epub+zip',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx':
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.csv': 'text/csv',
    },
  },
  [MediaCategory.WebMedia]: {
    extensions: ['.html', '.htm', '.xml', '.json', '.css', '.js', '.mjs'],
    mimeTypes: {
      '.html': 'text/html',
      '.htm': 'text/html',
      '.xml': 'application/xml',
      '.json': 'application/json',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.mjs': 'text/javascript',
    },
  },
  [MediaCategory.DesignFiles]: {
    extensions: [
      '.psd',
      '.ai',
      '.sketch',
      '.xd',
      '.fig',
      '.xcf',
      '.indd',
      '.afdesign',
      '.afphoto',
      '.afpub',
    ],
    mimeTypes: {
      '.psd': 'image/vnd.adobe.photoshop',
      '.ai': 'application/postscript',
      '.sketch': 'application/octet-stream',
      '.xd': 'application/octet-stream',
      '.fig': 'application/octet-stream',
      '.xcf': 'image/x-xcf',
      '.indd': 'application/x-indesign',
      '.afdesign': 'application/octet-stream',
      '.afphoto': 'application/octet-stream',
      '.afpub': 'application/octet-stream',
    },
  },
  [MediaCategory.Models3D]: {
    extensions: [
      '.obj',
      '.fbx',
      '.gltf',
      '.glb',
      '.stl',
      '.blend',
      '.dae',
      '.3ds',
      '.usdz',
      '.ply',
    ],
    mimeTypes: {
      '.obj': 'model/obj',
      '.fbx': 'application/octet-stream',
      '.gltf': 'model/gltf+json',
      '.glb': 'model/gltf-binary',
      '.stl': 'model/stl',
      '.blend': 'application/x-blender',
      '.dae': 'model/vnd.collada+xml',
      '.3ds': 'application/x-3ds',
      '.usdz': 'model/vnd.usdz+zip',
      '.ply': 'application/octet-stream',
    },
  },
  [MediaCategory.Archives]: {
    extensions: [
      '.zip',
      '.rar',
      '.7z',
      '.tar',
      '.gz',
      '.bz2',
      '.xz',
      '.tgz',
      '.tar.gz',
      '.tar.bz2',
    ],
    mimeTypes: {
      '.zip': 'application/zip',
      '.rar': 'application/vnd.rar',
      '.7z': 'application/x-7z-compressed',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip',
      '.bz2': 'application/x-bzip2',
      '.xz': 'application/x-xz',
      '.tgz': 'application/x-tar',
      '.tar.gz': 'application/x-tar',
      '.tar.bz2': 'application/x-tar',
    },
  },
  [MediaCategory.Fonts]: {
    extensions: ['.ttf', '.otf', '.woff', '.woff2', '.eot'],
    mimeTypes: {
      '.ttf': 'font/ttf',
      '.otf': 'font/otf',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.eot': 'application/vnd.ms-fontobject',
    },
  },
  [MediaCategory.Icons]: {
    extensions: ['.ico', '.icns', '.svg', '.png'],
    mimeTypes: {
      '.ico': 'image/x-icon',
      '.icns': 'image/x-icns',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
    },
  },
}

/**
 * Maps a file extension to its MIME type.
 * When an extension is shared across categories, the first category in definition order wins.
 */
export const EXTENSION_TO_MIME: Record<string, string> = buildExtensionToMime()

/**
 * Maps a file extension to its primary media category.
 * When an extension is shared across categories, the first category in definition order wins.
 */
export const EXTENSION_TO_CATEGORY: Record<string, MediaCategory> =
  buildExtensionToCategory()

function buildExtensionToMime(): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [, info] of Object.entries(CATEGORY_DEFINITIONS) as [
    MediaCategory,
    MediaCategoryInfo,
  ][]) {
    for (const ext of info.extensions) {
      if (!(ext in result)) {
        result[ext] = info.mimeTypes[ext] ?? 'application/octet-stream'
      }
    }
  }
  return result
}

function buildExtensionToCategory(): Record<string, MediaCategory> {
  const result: Record<string, MediaCategory> = {}
  for (const [category, info] of Object.entries(CATEGORY_DEFINITIONS) as [
    MediaCategory,
    MediaCategoryInfo,
  ][]) {
    for (const ext of info.extensions) {
      if (!(ext in result)) {
        result[ext] = category
      }
    }
  }
  return result
}
