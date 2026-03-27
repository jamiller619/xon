import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const libraries = sqliteTable("libraries", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  allowedMediaTypes: text("allowed_media_types").notNull().default("[]"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const dataSources = sqliteTable("data_sources", {
  id: text("id").primaryKey(),
  libraryId: text("library_id")
    .notNull()
    .references(() => libraries.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["local", "network"] }).notNull(),
  path: text("path").notNull(),
  recursive: integer("recursive", { mode: "boolean" }).notNull().default(true),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const mediaItems = sqliteTable(
  "media_items",
  {
    id: text("id").primaryKey(),
    libraryId: text("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    dataSourceId: text("data_source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    mimeType: text("mime_type"),
    mediaCategory: text("media_category"),
    title: text("title"),
    description: text("description"),
    metadata: text("metadata").notNull().default("{}"),
    drmProtected: integer("drm_protected", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    scannedAt: integer("scanned_at", { mode: "timestamp" }),
  },
  (table) => [
    index("media_items_library_id_idx").on(table.libraryId),
    index("media_items_media_category_idx").on(table.mediaCategory),
    index("media_items_file_path_idx").on(table.filePath),
  ]
);

export type Library = typeof libraries.$inferSelect;
export type NewLibrary = typeof libraries.$inferInsert;
export type DataSource = typeof dataSources.$inferSelect;
export type NewDataSource = typeof dataSources.$inferInsert;
export type MediaItem = typeof mediaItems.$inferSelect;
export type NewMediaItem = typeof mediaItems.$inferInsert;
