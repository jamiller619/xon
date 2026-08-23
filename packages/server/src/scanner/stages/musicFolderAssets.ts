import { importMusicFolderAssets } from '../musicFolderAssets.ts'
import type { FinalPipelineStage } from '../pipeline.ts'

export default {
  name: 'musicFolderAssets',
  async runAfterAll(ctx) {
    if (
      ctx.contentType !== 'audio' ||
      !ctx.dataSource ||
      !ctx.musicFolderAssets ||
      ctx.ownerId === undefined
    ) {
      return
    }

    await importMusicFolderAssets({
      db: ctx.db,
      libraryId: ctx.libraryId,
      libraryPublicId: ctx.libraryPublicId,
      ownerId: ctx.ownerId,
      dataSource: ctx.dataSource,
      ...ctx.musicFolderAssets,
      logger: ctx.logger,
    })
  },
} satisfies FinalPipelineStage
