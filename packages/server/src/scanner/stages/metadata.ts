import type { MetadataSourcePlugin } from '@xon/plugin-sdk'
import type { MediaType, Metadata } from '@xon/shared'
import { extractExiftoolMetadata } from '../../media/exiftool.js'
import { extractFfprobeMetadata } from '../../media/ffprobe.js'
import { extractMusicTags } from '../../media/musictags.js'
import { getPluginsByCategory } from '../../plugins/pluginManager.js'
import type { FileEntry } from '../fileEntry.js'
import type { PipelineStage } from '../pipeline.js'

export default {
  name: 'metadata',
  retry: 1,
  run: async (_, job) => {
    if (job.type === 'changed') {
      if (Object.keys(job.data.metadata).length > 0) {
        console.log(
          `Skipping metadata stage with existing data for changed file: ${job.file.path}`,
        )

        return
      }
    }

    console.log(`Parsing metadata for ${job.file.path}`)

    const jobMetadataCopy = { ...job.data.metadata }
    const fileMeta = await parseMetadataFromFile(job.file)

    if (fileMeta) {
      console.log(
        `Parsed metadata from file only for ${job.file.path}: ${JSON.stringify(fileMeta, null, 2)}`,
      )
      Object.assign(jobMetadataCopy, fileMeta)
    }

    const metadataPlugins =
      getPluginsByCategory<MetadataSourcePlugin>('MetadataSource')
    const plugins = metadataPlugins.filter((p) =>
      p.manifest.mediaTypes.includes(job.file.mediaType as MediaType.MainType),
    )

    for await (const plugin of plugins) {
      try {
        const pluginMeta = await plugin.instance.enrich(
          job.file.path,
          job.mediaTypes,
        )

        if (pluginMeta) {
          console.log(
            `Plugin metadata for ${job.file.path}: ${JSON.stringify(pluginMeta, null, 2)}`,
          )

          Object.assign(jobMetadataCopy, pluginMeta)

          return {
            title: 'title' in pluginMeta ? pluginMeta.title : job.data.title,
            metadata: jobMetadataCopy,
          }
        }
      } catch (err) {
        job.errors.push(err as Error)
      }
    }

    return { metadata: jobMetadataCopy }
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
