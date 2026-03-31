import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodSchema } from "zod";

/**
 * Wrapper around @hono/zod-validator that enforces a consistent error response format:
 * { error: string, details: ZodIssue[] }
 */
export function validate<T extends ZodSchema, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T
) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Validation failed", details: result.error.issues }, 400);
    }
  });
}
