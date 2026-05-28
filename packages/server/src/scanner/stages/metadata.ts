import type { MetadataSourcePlugin } from '@xon/plugin-sdk'
import { getCategoryForExtension, type Metadata } from '@xon/shared'
import { extractExiftoolMetadata } from '../../media/exiftool.js'
import { extractFfprobeMetadata } from '../../media/ffprobe.js'
import { extractMusicTags } from '../../media/musictags.js'
import { getPluginsByCategory } from '../../plugins/pluginManager.js'
import type { FileEntry } from '../fileEntry.js'
import type { PipelineStage } from '../pipeline.js'
import { isAudio, isImage, isVideo } from './shared.ts'

export default {
  name: 'metadata',
  retry: 1,
  run: async (_, job) => {
    if (job.type === 'changed') {
      console.log(`Skipping metadata for changed file: ${job.file.path}`)

      return
    }

    const fileCategory = getCategoryForExtension(job.file.ext)

    if (!fileCategory) {
      console.log(
        `No matching media category for ${job.file.path}; skipping metadata`,
      )
      return
    }

    console.log(`Parsing metadata for ${job.file.path}`)

    const meta = { ...job.data.metadata }
    const fileMeta = await parseMetadataFromFile(job.file)

    if (fileMeta) {
      console.log(
        `Parsed metadata from file only for ${job.file.path}: ${JSON.stringify(fileMeta, null, 2)}`,
      )
      Object.assign(meta, fileMeta)
    }

    const metadataPlugins =
      getPluginsByCategory<MetadataSourcePlugin>('MetadataSource')
    const plugins = metadataPlugins.filter((p) =>
      p.manifest.mediaCategories?.includes(fileCategory),
    )

    for await (const plugin of plugins) {
      try {
        const pluginMeta = await plugin.instance.enrich(
          job.file.path,
          fileCategory,
        )

        if (pluginMeta) {
          console.log(
            `Plugin metadata for ${job.file.path}: ${JSON.stringify(pluginMeta, null, 2)}`,
          )

          Object.assign(meta, pluginMeta)

          return {
            metadata: meta,
          }
        }
      } catch (err) {
        job.errors.push(err as Error)
      }
    }

    return { metadata: meta }
  },
} satisfies PipelineStage

async function parseMetadataFromFile(
  file: FileEntry,
): Promise<Metadata | null | undefined> {
  if (isAudio(file.mimeType)) {
    return extractMusicTags(file.path)
  }

  if (isVideo(file.mimeType)) {
    return extractFfprobeMetadata(file.path)
  }

  if (isImage(file.mimeType)) {
    return extractExiftoolMetadata(file.path)
  }
}
