import { MediaType } from '@xon/shared'
import { z } from 'zod'

export const resourceIdSchema = z.string().trim().min(1).max(512)

export const resourceIdParamsSchema = z.object({
  id: resourceIdSchema,
})

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})

export const sortOrderSchema = z.enum(['asc', 'desc'])

export function listQuerySchema<const Fields extends readonly string[]>(
  fields: Fields,
  defaults: { sortBy: Fields[number]; order: z.infer<typeof sortOrderSchema> },
) {
  return paginationQuerySchema.extend({
    sortBy: z.enum(fields).optional().default(defaults.sortBy),
    order: sortOrderSchema.optional().default(defaults.order),
  })
}

export const booleanQuerySchema = z.stringbool()

export const mediaFilterQuerySchema = z.object({
  mediaType: z.enum(MediaType.MainType).optional(),
  unmatched: booleanQuerySchema.optional().default(false),
})
