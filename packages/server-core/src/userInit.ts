import { randomUUID } from "node:crypto";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { hashPassword } from "./password.js";
import { users } from "./schema.js";

const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "admin";
const DEFAULT_ADMIN_EMAIL = "admin@localhost";
const DEFAULT_ADMIN_DISPLAY_NAME = "Administrator";

export async function ensureAdminUser(db: LibSQLDatabase): Promise<void> {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) {
    return;
  }

  const passwordHash = await hashPassword(DEFAULT_ADMIN_PASSWORD);
  await db.insert(users).values({
    id: randomUUID(),
    username: DEFAULT_ADMIN_USERNAME,
    email: DEFAULT_ADMIN_EMAIL,
    displayName: DEFAULT_ADMIN_DISPLAY_NAME,
    passwordHash,
    role: "admin",
  });

  console.log(
    `[userInit] Created default admin user (username: ${DEFAULT_ADMIN_USERNAME}, password: ${DEFAULT_ADMIN_PASSWORD}). Change the password after first login.`
  );
}
