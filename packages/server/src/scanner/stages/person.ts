import type {
  PersonImageResult,
  default as TmdbMetadataPlugin,
} from '@xon/plugin-tmdb-metadata'
import type { Metadata } from '@xon/shared'
import { eq } from 'drizzle-orm'
import pLimit from 'p-limit'
import { mediaItems, people, peopleMedia } from '../../db/schema.js'
import { insertWithGeneratedPublicId } from '../../lib/publicId.js'
import { registry } from '../../plugins/pluginManager.js'
import type { PipelineStage } from '../pipeline.js'

type TmdbCastMember = {
  character: string
  id: number
  name: string
  order: number
}

/**
 * Stage for taking cast metadata and calling the TMDB api
 * to fetch images and saving them to the database
 */
export default {
  name: 'person',
  retry: 1,
  async run(ctx, job) {
    if (job.type === 'changed') return

    // If there's no cast in the metadata, then nothing to
    // do here, carry on...
    if (job.data.metadata?.cast == null || job.data.metadata.cast.length < 1) {
      return
    }

    const tmdbPlugin = registry.get('@xon/plugin-tmdb-metadata')?.instance as
      | TmdbMetadataPlugin
      | undefined

    if (!tmdbPlugin) {
      ctx.logger.debug(`TMDB plugin not found, skipping person stage`)

      return
    }

    const { cast, ...metadata } = job.data.metadata as {
      cast: TmdbCastMember[]
    } & Metadata

    // A person may appear multiple times in the cast (different characters).
    // Group by tmdb id so each person is saved once, with a credit per character.
    const castByPerson = new Map<number, TmdbCastMember[]>()

    for (const castMember of cast) {
      const group = castByPerson.get(castMember.id) ?? []
      group.push(castMember)
      castByPerson.set(castMember.id, group)
    }

    const uniqueCast = Array.from(
      castByPerson.values(),
      (group) => group[0],
    ).filter((member): member is TmdbCastMember => member != null)

    const peopleImages = await fetchPeopleImages(tmdbPlugin, uniqueCast)

    if (job.data.id == null) {
      throw new Error('Person stage: media item has no internal id')
    }
    const mediaItemId = job.data.id

    await ctx.db.transaction(async (tx) => {
      for (const [tmdbId, group] of castByPerson) {
        const primary = group[0]
        if (!primary) continue

        const avatarUrl = peopleImages.find((i) => i.personId === tmdbId)?.url
        const person = await insertWithGeneratedPublicId(async (publicId) => {
          const [row] = await tx
            .insert(people)
            .values({
              publicId,
              name: primary.name,
              avatarUrl,
              metadata: { tmdbId },
            })
            .onConflictDoUpdate({
              target: people.name,
              set: { avatarUrl, metadata: { tmdbId } },
            })
            .returning({ id: people.id })
          return row
        })

        if (!person) continue

        for (const member of group) {
          await insertWithGeneratedPublicId(async (publicId) => {
            await tx
              .insert(peopleMedia)
              .values({
                publicId,
                mediaId: mediaItemId,
                personId: person.id,
                role: member.character,
                order: member.order,
              })
              .onConflictDoNothing({
                target: [
                  peopleMedia.personId,
                  peopleMedia.mediaId,
                  peopleMedia.role,
                ],
              })
          })
        }
      }

      // persist already wrote this row with `cast` in metadata; overwrite with
      // the cast-stripped metadata now that credits live in people/peopleMedia.
      await tx
        .update(mediaItems)
        .set({ metadata })
        .where(eq(mediaItems.id, mediaItemId))
    })

    return {
      metadata,
    }
  },
} satisfies PipelineStage

const limit = pLimit(5)

async function fetchPeopleImages(
  plugin: TmdbMetadataPlugin,
  people: TmdbCastMember[],
) {
  const input = people.map((person) =>
    limit(() => plugin.fetchPersonImage(person.id)),
  )
  const result = await Promise.all(input)

  return result.filter((r): r is PersonImageResult => !!r)
}
