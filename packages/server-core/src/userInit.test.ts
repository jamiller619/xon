import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase } from "./migrate.js";
import { verifyPassword } from "./password.js";
import { users } from "./schema.js";
import { ensureAdminUser } from "./userInit.js";

describe("ensureAdminUser", () => {
  let db: LibSQLDatabase;

  beforeEach(async () => {
    const client = createClient({ url: ":memory:" });
    db = drizzle(client);
    await migrateDatabase(db);
  });

  it("creates an admin user when none exist", async () => {
    await ensureAdminUser(db);
    const allUsers = await db.select().from(users);
    expect(allUsers).toHaveLength(1);
    const admin = allUsers[0];
    expect(admin?.username).toBe("admin");
    expect(admin?.email).toBe("admin@localhost");
    expect(admin?.displayName).toBe("Administrator");
    expect(admin?.role).toBe("admin");
  });

  it("admin password is verifiable", async () => {
    await ensureAdminUser(db);
    const [admin] = await db.select().from(users).where(eq(users.username, "admin"));
    expect(admin).toBeDefined();
    const passwordHash = admin?.passwordHash ?? "";
    const valid = await verifyPassword(passwordHash, "admin");
    expect(valid).toBe(true);
  });

  it("does not create a second user if one already exists", async () => {
    await ensureAdminUser(db);
    await ensureAdminUser(db);
    const allUsers = await db.select().from(users);
    expect(allUsers).toHaveLength(1);
  });
});
