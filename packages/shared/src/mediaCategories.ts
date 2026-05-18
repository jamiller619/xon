export enum MediaCategory {
  Movies = 'Movies',
  TVShows = 'TV Shows',
  // Clips = 'Clips',
  Music = 'Music',
  // Audiobooks = 'Audiobooks',
  // AudioClips = 'Audio Clips',
  // Podcasts = 'Podcasts',
  Pictures = 'Pictures',
  // Images = 'Images',
  // Textures = 'Textures',
  HomeVideos = 'Home Videos',
  // Games = 'Games',
  // InteractiveMedia = 'Interactive Media',
  // Documents = 'Documents',
  // WebMedia = 'Web Media',
  // DesignFiles = 'Design Files',
  // Models3D = '3D Models',
  // Archives = 'Archives',
  // Fonts = 'Fonts',
  // Icons = 'Icons',
}

type Extension = `.${string}`
type MimeType = `${string}/${string}`

export type MediaCategoryInfo = {
  [key: Extension]: MimeType
}

export function getExtensionsForCategory(category: MediaCategory): Extension[] {
  return Object.keys(CATEGORY_DEFINITIONS[category]) as Extension[]
}

export function getMimeTypesForCategory(category: MediaCategory): MimeType[] {
  return Object.values(CATEGORY_DEFINITIONS[category])
}

export function getMimeTypeForExtension(
  extension: string,
): MimeType | undefined {
  for (const category in CATEGORY_DEFINITIONS) {
    const data =
      CATEGORY_DEFINITIONS[category as keyof typeof CATEGORY_DEFINITIONS]

    if (data[extension as Extension]) {
      return data[extension as Extension]
    }
  }
}

export const CATEGORY_DEFINITIONS: Record<MediaCategory, MediaCategoryInfo> = {
  [MediaCategory.Movies]: {
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
  [MediaCategory.TVShows]: {
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
  // [MediaCategory.Clips]: {
  //   '.mp4': 'video/mp4',
  //   '.mkv': 'video/x-matroska',
  //   '.mov': 'video/quicktime',
  //   '.webm': 'video/webm',
  //   '.avi': 'video/x-msvideo',
  //   '.gif': 'image/gif',
  // },
  [MediaCategory.Music]: {
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
  // [MediaCategory.Audiobooks]: {
  //   '.m4b': 'audio/mp4',
  //   '.mp3': 'audio/mpeg',
  //   '.flac': 'audio/flac',
  //   '.ogg': 'audio/ogg',
  //   '.opus': 'audio/opus',
  //   '.aac': 'audio/aac',
  // },
  // [MediaCategory.AudioClips]: {
  //   '.mp3': 'audio/mpeg',
  //   '.wav': 'audio/wav',
  //   '.aac': 'audio/aac',
  //   '.ogg': 'audio/ogg',
  //   '.flac': 'audio/flac',
  //   '.opus': 'audio/opus',
  // },
  // [MediaCategory.Podcasts]: {
  //   '.mp3': 'audio/mpeg',
  //   '.m4a': 'audio/mp4',
  //   '.ogg': 'audio/ogg',
  //   '.opus': 'audio/opus',
  //   '.aac': 'audio/aac',
  // },
  [MediaCategory.Pictures]: {
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
  // [MediaCategory.Images]: {
  //   '.jpg': 'image/jpeg',
  //   '.jpeg': 'image/jpeg',
  //   '.png': 'image/png',
  //   '.gif': 'image/gif',
  //   '.bmp': 'image/bmp',
  //   '.tiff': 'image/tiff',
  //   '.tif': 'image/tiff',
  //   '.webp': 'image/webp',
  //   '.heic': 'image/heic',
  //   '.svg': 'image/svg+xml',
  //   '.avif': 'image/avif',
  // },
  // [MediaCategory.Textures]: {
  //   '.png': 'image/png',
  //   '.jpg': 'image/jpeg',
  //   '.jpeg': 'image/jpeg',
  //   '.tga': 'image/x-tga',
  //   '.dds': 'image/vnd.ms-dds',
  //   '.hdr': 'image/vnd.radiance',
  //   '.exr': 'image/x-exr',
  //   '.bmp': 'image/bmp',
  //   '.tiff': 'image/tiff',
  // },
  [MediaCategory.HomeVideos]: {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.wmv': 'video/x-ms-wmv',
    '.3gp': 'video/3gpp',
    '.mkv': 'video/x-matroska',
    '.m4v': 'video/x-m4v',
    '.webm': 'video/webm',
  },
  // [MediaCategory.Games]: {
  //   '.iso': 'application/x-iso9660-image',
  //   '.rom': 'application/octet-stream',
  //   '.bin': 'application/octet-stream',
  //   '.nsp': 'application/octet-stream',
  //   '.xci': 'application/octet-stream',
  //   '.gba': 'application/octet-stream',
  //   '.nds': 'application/octet-stream',
  //   '.nes': 'application/octet-stream',
  //   '.sfc': 'application/octet-stream',
  //   '.smc': 'application/octet-stream',
  //   '.z64': 'application/octet-stream',
  //   '.n64': 'application/octet-stream',
  // },
  // [MediaCategory.InteractiveMedia]: {
  //   '.html': 'text/html',
  //   '.htm': 'text/html',
  //   '.swf': 'application/x-shockwave-flash',
  //   '.unity3d': 'application/vnd.unity',
  // },
  // [MediaCategory.Documents]: {
  //   '.pdf': 'application/pdf',
  //   '.doc': 'application/msword',
  //   '.docx':
  //     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  //   '.txt': 'text/plain',
  //   '.md': 'text/markdown',
  //   '.odt': 'application/vnd.oasis.opendocument.text',
  //   '.rtf': 'application/rtf',
  //   '.epub': 'application/epub+zip',
  //   '.xls': 'application/vnd.ms-excel',
  //   '.xlsx':
  //     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  //   '.ppt': 'application/vnd.ms-powerpoint',
  //   '.pptx':
  //     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  //   '.csv': 'text/csv',
  // },
  // [MediaCategory.WebMedia]: {
  //   '.html': 'text/html',
  //   '.htm': 'text/html',
  //   '.xml': 'application/xml',
  //   '.json': 'application/json',
  //   '.css': 'text/css',
  //   '.js': 'text/javascript',
  //   '.mjs': 'text/javascript',
  // },
  // [MediaCategory.DesignFiles]: {
  //   '.psd': 'image/vnd.adobe.photoshop',
  //   '.ai': 'application/postscript',
  //   '.sketch': 'application/octet-stream',
  //   '.xd': 'application/octet-stream',
  //   '.fig': 'application/octet-stream',
  //   '.xcf': 'image/x-xcf',
  //   '.indd': 'application/x-indesign',
  //   '.afdesign': 'application/octet-stream',
  //   '.afphoto': 'application/octet-stream',
  //   '.afpub': 'application/octet-stream',
  // },
  // [MediaCategory.Models3D]: {
  //   '.obj': 'model/obj',
  //   '.fbx': 'application/octet-stream',
  //   '.gltf': 'model/gltf+json',
  //   '.glb': 'model/gltf-binary',
  //   '.stl': 'model/stl',
  //   '.blend': 'application/x-blender',
  //   '.dae': 'model/vnd.collada+xml',
  //   '.3ds': 'application/x-3ds',
  //   '.usdz': 'model/vnd.usdz+zip',
  //   '.ply': 'application/octet-stream',
  // },
  // [MediaCategory.Archives]: {
  //   '.zip': 'application/zip',
  //   '.rar': 'application/vnd.rar',
  //   '.7z': 'application/x-7z-compressed',
  //   '.tar': 'application/x-tar',
  //   '.gz': 'application/gzip',
  //   '.bz2': 'application/x-bzip2',
  //   '.xz': 'application/x-xz',
  //   '.tgz': 'application/x-tar',
  //   '.tar.gz': 'application/x-tar',
  //   '.tar.bz2': 'application/x-tar',
  // },
  // [MediaCategory.Fonts]: {
  //   '.ttf': 'font/ttf',
  //   '.otf': 'font/otf',
  //   '.woff': 'font/woff',
  //   '.woff2': 'font/woff2',
  //   '.eot': 'application/vnd.ms-fontobject',
  // },
  // [MediaCategory.Icons]: {
  //   '.ico': 'image/x-icon',
  //   '.icns': 'image/x-icns',
  //   '.svg': 'image/svg+xml',
  //   '.png': 'image/png',
  // },
}
