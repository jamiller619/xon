import type { Metadata } from '@xon/shared'
import { extractExiftoolMetadata } from '../../media/exiftool.ts'
import { extractFfprobeMetadata } from '../../media/ffprobe.ts'
import { extractMusicTags } from '../../media/musictags.ts'
import type { FileEntry } from '../fileEntry.ts'
import type { PipelineStage } from '../pipeline.ts'

export default {
  name: 'fileMetadata',
  retry: 1,
  run: async (_, job) => {
    if (job.type === 'changed') return

    const fileMetaCopy = { ...job.data.fileMetadata }

    if (Object.keys(fileMetaCopy).length > 0) {
      return undefined
    }

    const fileMeta = await parseMetadataFromFile(job.file)

    if (fileMeta) {
      return {
        fileMetadata: fileMeta,
      }
    }
  },
} satisfies PipelineStage

async function parseMetadataFromFile(
  file: FileEntry,
): Promise<Metadata | null | undefined> {
  if (file.mediaType.startsWith('audio')) {
    return extractMusicTags(file.path)
  }

  if (file.mediaType.startsWith('video')) {
    return extractFfprobeMetadata(file.path)
  }

  if (file.mediaType.startsWith('image')) {
    return extractExiftoolMetadata(file.path)
  }
}
