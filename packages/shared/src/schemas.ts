import { z } from "zod";

/** Common pagination query params (coerces string inputs to numbers). */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

/** Common sort order query param. */
export const sortOrderSchema = z.enum(["asc", "desc"]);

export type SortOrder = z.infer<typeof sortOrderSchema>;
