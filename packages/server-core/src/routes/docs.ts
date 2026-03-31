import { Hono } from "hono";

const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Xon Media Center API",
    version: "1.0.0",
    description:
      "Self-hosted, plugin-driven media center platform for managing diverse media libraries with a unified interface.",
    contact: { name: "Xon Media Center" },
  },
  servers: [{ url: "/api/v1", description: "Current server" }],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "JWT access token (from POST /auth/login) or API token (xon_<hex>) in Authorization header.",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: { type: "string", description: "Human-readable error message" },
        },
        required: ["error"],
      },
      ValidationError: {
        type: "object",
        properties: {
          error: { type: "string", example: "Validation failed" },
          details: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "array", items: { type: "string" } },
                message: { type: "string" },
                code: { type: "string" },
              },
            },
          },
        },
        required: ["error", "details"],
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          username: { type: "string" },
          email: { type: "string", format: "email", nullable: true },
          displayName: { type: "string", nullable: true },
          avatarUrl: { type: "string", nullable: true },
          role: { type: "string", enum: ["admin", "manager", "user", "guest"] },
          maxContentRating: {
            type: "string",
            enum: ["none", "G", "PG", "PG-13", "R", "NC-17", "unrated"],
          },
          hideDrmItems: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "username", "role"],
      },
      Library: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          description: { type: "string", nullable: true },
          posterUrl: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
        required: ["id", "name"],
      },
      DataSource: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          libraryId: { type: "string", format: "uuid" },
          name: { type: "string" },
          type: { type: "string", enum: ["local", "network", "plugin"] },
          path: { type: "string" },
          pluginId: { type: "string", nullable: true },
          enabled: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "libraryId", "name", "type", "path", "enabled"],
      },
      MediaItem: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          libraryId: { type: "string", format: "uuid" },
          sourceId: { type: "string", format: "uuid" },
          title: { type: "string" },
          filePath: { type: "string" },
          mediaCategory: { type: "string" },
          mimeType: { type: "string", nullable: true },
          fileSize: { type: "integer", nullable: true },
          drmProtected: { type: "boolean" },
          contentRating: { type: "string", nullable: true },
          rating: { type: "number", nullable: true },
          releaseDate: { type: "string", format: "date", nullable: true },
          duration: { type: "integer", nullable: true },
          thumbnailPath: { type: "string", nullable: true },
          thumbnailUrl: { type: "string", nullable: true },
          posterUrl: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
        required: ["id", "libraryId", "title", "filePath", "mediaCategory"],
      },
      Group: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          libraryId: { type: "string", format: "uuid" },
          name: { type: "string" },
          groupType: { type: "string" },
          metadata: { type: "object", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "libraryId", "name", "groupType"],
      },
      Pagination: {
        type: "object",
        properties: {
          total: { type: "integer" },
          page: { type: "integer" },
          limit: { type: "integer" },
          pages: { type: "integer" },
        },
        required: ["total", "page", "limit", "pages"],
      },
      ApiToken: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          expiresAt: { type: "string", format: "date-time", nullable: true },
          lastUsedAt: { type: "string", format: "date-time", nullable: true },
        },
        required: ["id", "name", "createdAt"],
      },
      BackupTarget: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          type: { type: "string", enum: ["local", "network", "plugin"] },
          config: { type: "object" },
          enabled: { type: "boolean" },
          removeDeleted: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "name", "type", "config", "enabled", "removeDeleted"],
      },
      SyncProfile: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          type: { type: "string", enum: ["full", "partial"] },
          scope: { type: "object", nullable: true },
          targetPath: { type: "string" },
          includeMedia: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
        required: ["id", "name", "type", "targetPath", "includeMedia"],
      },
      ServerSettings: {
        type: "object",
        properties: {
          corsEnabled: { type: "boolean" },
          corsAllowedOrigins: { type: "array", items: { type: "string" } },
          rateLimitEnabled: { type: "boolean" },
          rateLimitGeneral: { type: "integer" },
          rateLimitAuth: { type: "integer" },
          httpsEnabled: { type: "boolean" },
          trustProxy: { type: "boolean" },
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        description: "Returns server health status. Does not require authentication.",
        security: [],
        responses: {
          "200": {
            description: "Server is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login",
        description: "Authenticate with username and password. Returns JWT access token.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  username: { type: "string", minLength: 1 },
                  password: { type: "string", minLength: 1 },
                },
                required: ["username", "password"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Login successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    accessToken: { type: "string" },
                    user: { $ref: "#/components/schemas/User" },
                  },
                },
              },
            },
          },
          "401": {
            description: "Invalid credentials",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
          "422": {
            description: "Validation error",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ValidationError" } },
            },
          },
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout",
        description: "Invalidates the refresh token cookie.",
        responses: {
          "200": {
            description: "Logged out successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { message: { type: "string" } },
                },
              },
            },
          },
        },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Refresh access token",
        description: "Uses the refresh token cookie to issue a new access token.",
        security: [],
        responses: {
          "200": {
            description: "New access token issued",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { accessToken: { type: "string" } },
                },
              },
            },
          },
          "401": {
            description: "Refresh token missing or invalid",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current user",
        description: "Returns the authenticated user's profile.",
        responses: {
          "200": {
            description: "Current user profile",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/User" } },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
    },
    "/libraries": {
      get: {
        tags: ["Libraries"],
        summary: "List libraries",
        description: "Returns libraries accessible to the current user.",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: {
          "200": {
            description: "List of libraries",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Library" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Libraries"],
        summary: "Create library",
        description: "Creates a new library. Requires admin or manager role.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", minLength: 1 },
                  description: { type: "string" },
                  posterUrl: { type: "string" },
                },
                required: ["name"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Library created",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Library" } },
            },
          },
          "403": {
            description: "Forbidden — insufficient role",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
          "422": {
            description: "Validation error",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ValidationError" } },
            },
          },
        },
      },
    },
    "/libraries/{id}": {
      get: {
        tags: ["Libraries"],
        summary: "Get library",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Library details",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Library" } },
            },
          },
          "404": {
            description: "Not found",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
      put: {
        tags: ["Libraries"],
        summary: "Update library",
        description: "Requires admin or manager role.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", minLength: 1 },
                  description: { type: "string" },
                  posterUrl: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Library updated",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Library" } },
            },
          },
          "404": {
            description: "Not found",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
      delete: {
        tags: ["Libraries"],
        summary: "Delete library",
        description: "Requires admin or manager role.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Deleted successfully",
            content: {
              "application/json": {
                schema: { type: "object", properties: { message: { type: "string" } } },
              },
            },
          },
          "404": {
            description: "Not found",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
    },
    "/libraries/{libraryId}/media": {
      get: {
        tags: ["Libraries"],
        summary: "List library media",
        description: "Returns paginated media items for a library.",
        parameters: [
          { name: "libraryId", in: "path", required: true, schema: { type: "string" } },
          { name: "mediaCategory", in: "query", schema: { type: "string" } },
          { name: "mimeType", in: "query", schema: { type: "string" } },
          {
            name: "drmProtected",
            in: "query",
            schema: { type: "string", enum: ["true", "false"] },
          },
          {
            name: "sortBy",
            in: "query",
            schema: {
              type: "string",
              enum: ["title", "fileSize", "releaseDate", "rating", "createdAt"],
            },
          },
          { name: "order", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: {
          "200": {
            description: "Paginated list of media items",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/MediaItem" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
          "404": {
            description: "Library not found",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
    },
    "/libraries/{libraryId}/sources": {
      get: {
        tags: ["Libraries"],
        summary: "List data sources for a library",
        parameters: [{ name: "libraryId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "List of data sources",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/DataSource" } },
              },
            },
          },
        },
      },
      post: {
        tags: ["Libraries"],
        summary: "Add data source to library",
        description: "Requires admin or manager role.",
        parameters: [{ name: "libraryId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", minLength: 1 },
                  type: { type: "string", enum: ["local", "network", "plugin"] },
                  path: { type: "string", minLength: 1 },
                  pluginId: { type: "string" },
                  enabled: { type: "boolean", default: true },
                },
                required: ["name", "type", "path"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Data source created",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/DataSource" } },
            },
          },
          "422": {
            description: "Validation error",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ValidationError" } },
            },
          },
        },
      },
    },
    "/libraries/{libraryId}/scan": {
      post: {
        tags: ["Libraries"],
        summary: "Trigger library scan",
        description: "Starts a background scan of the library's data sources.",
        parameters: [{ name: "libraryId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "202": {
            description: "Scan started",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                    scanId: { type: "string" },
                  },
                },
              },
            },
          },
          "404": {
            description: "Library not found",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
    },
    "/media/{id}": {
      get: {
        tags: ["Media"],
        summary: "Get media item",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Media item details",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/MediaItem" } },
            },
          },
          "404": {
            description: "Not found",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
      put: {
        tags: ["Media"],
        summary: "Update media item metadata",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  rating: { type: "number", minimum: 0, maximum: 10 },
                  contentRating: { type: "string" },
                  releaseDate: { type: "string", format: "date" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated media item",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/MediaItem" } },
            },
          },
          "404": {
            description: "Not found",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
    },
    "/media/{id}/stream": {
      get: {
        tags: ["Media"],
        summary: "Stream media file",
        description: "Returns the raw media file with Range request support for seeking.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          {
            name: "Range",
            in: "header",
            schema: { type: "string", example: "bytes=0-1023" },
          },
        ],
        responses: {
          "200": { description: "Full file content" },
          "206": { description: "Partial content (Range request)" },
          "404": {
            description: "Not found",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
    },
    "/media/{id}/thumbnail": {
      get: {
        tags: ["Media"],
        summary: "Get media thumbnail",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          {
            name: "size",
            in: "query",
            schema: { type: "string", enum: ["small", "medium", "large"] },
          },
        ],
        responses: {
          "200": { description: "Thumbnail image (JPEG or WebP)" },
          "404": {
            description: "Not found",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
    },
    "/media/{id}/hls/playlist.m3u8": {
      get: {
        tags: ["Media"],
        summary: "Get HLS playlist for adaptive streaming",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "M3U8 playlist" },
          "404": {
            description: "Not found",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
    },
    "/media/{id}/progress": {
      get: {
        tags: ["Media"],
        summary: "Get playback progress",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Current playback progress",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    position: { type: "number", description: "Position in seconds" },
                    duration: { type: "number" },
                    percent: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
      put: {
        tags: ["Media"],
        summary: "Update playback progress",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  position: { type: "number", minimum: 0, description: "Position in seconds" },
                },
                required: ["position"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Progress updated" },
        },
      },
    },
    "/search": {
      get: {
        tags: ["Search"],
        summary: "Full-text search",
        description: "Searches media items across accessible libraries.",
        parameters: [
          { name: "q", in: "query", required: true, schema: { type: "string", minLength: 1 } },
          { name: "category", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, default: 20 } },
          { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
        ],
        responses: {
          "200": {
            description: "Search results",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/MediaItem" } },
                    total: { type: "integer" },
                  },
                },
              },
            },
          },
          "422": {
            description: "Validation error (missing q parameter)",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ValidationError" } },
            },
          },
        },
      },
    },
    "/groups": {
      get: {
        tags: ["Groups"],
        summary: "List groups",
        parameters: [
          { name: "libraryId", in: "query", schema: { type: "string" } },
          { name: "groupType", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: {
          "200": {
            description: "Paginated list of groups",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Group" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Groups"],
        summary: "Create group",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  libraryId: { type: "string" },
                  name: { type: "string", minLength: 1 },
                  groupType: { type: "string", minLength: 1 },
                  metadata: { type: "object" },
                },
                required: ["libraryId", "name", "groupType"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Group created",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Group" } },
            },
          },
        },
      },
    },
    "/groups/{id}": {
      get: {
        tags: ["Groups"],
        summary: "Get group",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Group with members",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/Group" },
                    {
                      type: "object",
                      properties: {
                        members: {
                          type: "array",
                          items: { $ref: "#/components/schemas/MediaItem" },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          "404": {
            description: "Not found",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
      put: {
        tags: ["Groups"],
        summary: "Update group",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  metadata: { type: "object" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Group updated",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Group" } },
            },
          },
        },
      },
      delete: {
        tags: ["Groups"],
        summary: "Delete group",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Deleted" },
          "404": {
            description: "Not found",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
    },
    "/users/me": {
      get: {
        tags: ["Users"],
        summary: "Get my profile",
        responses: {
          "200": {
            description: "Current user profile",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/User" } },
            },
          },
        },
      },
      put: {
        tags: ["Users"],
        summary: "Update my profile",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", format: "email" },
                  displayName: { type: "string" },
                  avatarUrl: { type: "string" },
                  password: { type: "string", minLength: 8 },
                  maxContentRating: {
                    type: "string",
                    enum: ["none", "G", "PG", "PG-13", "R", "NC-17", "unrated"],
                  },
                  hideDrmItems: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Profile updated",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/User" } },
            },
          },
        },
      },
    },
    "/users/me/api-tokens": {
      get: {
        tags: ["Users"],
        summary: "List my API tokens",
        responses: {
          "200": {
            description: "List of API tokens",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/ApiToken" } },
              },
            },
          },
        },
      },
      post: {
        tags: ["Users"],
        summary: "Create API token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", minLength: 1 },
                  expiresIn: {
                    type: "integer",
                    description: "Expiry in seconds (omit for non-expiring)",
                  },
                },
                required: ["name"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Token created — token value returned once, store it securely",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/ApiToken" },
                    {
                      type: "object",
                      properties: {
                        token: { type: "string", description: "xon_<hex> token value" },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
    "/users/me/api-tokens/{id}": {
      delete: {
        tags: ["Users"],
        summary: "Delete API token",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Token deleted" },
          "404": {
            description: "Not found",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
    },
    "/sync/profiles": {
      get: {
        tags: ["Sync"],
        summary: "List sync profiles",
        responses: {
          "200": {
            description: "List of sync profiles",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/SyncProfile" } },
              },
            },
          },
        },
      },
      post: {
        tags: ["Sync"],
        summary: "Create sync profile",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", minLength: 1 },
                  type: { type: "string", enum: ["full", "partial"] },
                  scope: { type: "object" },
                  targetPath: { type: "string", minLength: 1 },
                  includeMedia: { type: "boolean", default: false },
                },
                required: ["name", "type", "targetPath"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Sync profile created",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/SyncProfile" } },
            },
          },
        },
      },
    },
    "/sync/profiles/{id}/run": {
      post: {
        tags: ["Sync"],
        summary: "Run sync profile",
        description: "Starts a background sync job for the profile.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "202": {
            description: "Sync job started",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    runId: { type: "string" },
                    status: { type: "string", example: "running" },
                  },
                },
              },
            },
          },
          "404": {
            description: "Profile not found",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
    },
    "/admin/users": {
      get: {
        tags: ["Admin — Users"],
        summary: "List all users",
        description: "Admin only.",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: {
          "200": {
            description: "Paginated list of users",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/User" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
          "403": {
            description: "Forbidden",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
      post: {
        tags: ["Admin — Users"],
        summary: "Create user",
        description: "Admin only.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  username: { type: "string", minLength: 3 },
                  password: { type: "string", minLength: 8 },
                  email: { type: "string", format: "email" },
                  role: { type: "string", enum: ["admin", "manager", "user", "guest"] },
                },
                required: ["username", "password"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "User created",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/User" } },
            },
          },
        },
      },
    },
    "/admin/users/{id}": {
      put: {
        tags: ["Admin — Users"],
        summary: "Update user",
        description: "Admin only.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", format: "email" },
                  displayName: { type: "string" },
                  role: { type: "string", enum: ["admin", "manager", "user", "guest"] },
                  password: { type: "string", minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "User updated",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/User" } },
            },
          },
          "404": {
            description: "Not found",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
      delete: {
        tags: ["Admin — Users"],
        summary: "Delete user",
        description: "Admin only.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "User deleted" },
          "404": {
            description: "Not found",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
    },
    "/admin/backup/targets": {
      get: {
        tags: ["Admin — Backup"],
        summary: "List backup targets",
        description: "Admin only.",
        responses: {
          "200": {
            description: "List of backup targets",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/BackupTarget" } },
              },
            },
          },
        },
      },
      post: {
        tags: ["Admin — Backup"],
        summary: "Create backup target",
        description: "Admin only.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", minLength: 1 },
                  type: { type: "string", enum: ["local", "network", "plugin"] },
                  config: { type: "object" },
                  enabled: { type: "boolean", default: true },
                  removeDeleted: { type: "boolean", default: false },
                },
                required: ["name", "type", "config"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Backup target created",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/BackupTarget" } },
            },
          },
        },
      },
    },
    "/admin/backup/media": {
      post: {
        tags: ["Admin — Backup"],
        summary: "Trigger media backup",
        description: "Admin only. Starts a background backup job.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  targetId: { type: "string" },
                  backupAll: { type: "boolean", default: false },
                  libraryIds: { type: "array", items: { type: "string" } },
                  mediaTypes: { type: "array", items: { type: "string" } },
                  itemIds: { type: "array", items: { type: "string" } },
                },
                required: ["targetId"],
              },
            },
          },
        },
        responses: {
          "202": {
            description: "Backup job started",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    jobId: { type: "string" },
                    status: { type: "string", example: "running" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/admin/server-settings": {
      get: {
        tags: ["Admin — Server Settings"],
        summary: "Get server settings",
        description: "Admin only.",
        responses: {
          "200": {
            description: "Current server settings",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ServerSettings" } },
            },
          },
        },
      },
      put: {
        tags: ["Admin — Server Settings"],
        summary: "Update server settings",
        description: "Admin only.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ServerSettings" },
            },
          },
        },
        responses: {
          "200": {
            description: "Settings updated",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ServerSettings" } },
            },
          },
        },
      },
    },
    "/admin/plugins": {
      get: {
        tags: ["Admin — Plugins"],
        summary: "List installed plugins",
        description: "Admin only.",
        responses: {
          "200": {
            description: "List of installed plugins",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" },
                      version: { type: "string" },
                      type: { type: "string" },
                      enabled: { type: "boolean" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  tags: [
    { name: "System", description: "Server health and status" },
    { name: "Auth", description: "Authentication and session management" },
    { name: "Libraries", description: "Media library management" },
    { name: "Media", description: "Media item access and streaming" },
    { name: "Search", description: "Full-text search across libraries" },
    { name: "Groups", description: "Media grouping (albums, series, collections)" },
    { name: "Users", description: "User profile and API token management" },
    { name: "Sync", description: "Sync profiles for offline/external copies" },
    { name: "Admin — Users", description: "Admin: user account management" },
    { name: "Admin — Backup", description: "Admin: backup targets and jobs" },
    { name: "Admin — Server Settings", description: "Admin: CORS, rate limiting, HTTPS, proxy" },
    { name: "Admin — Plugins", description: "Admin: plugin management" },
  ],
};

/** Swagger UI HTML using CDN-hosted assets. */
function makeSwaggerHtml(specUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Xon Media Center API Docs</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body { margin: 0; }
    #swagger-ui .topbar { background-color: #1a1a2e; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: "${specUrl}",
      dom_id: "#swagger-ui",
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: "BaseLayout",
      deepLinking: true,
      persistAuthorization: true,
    });
  </script>
</body>
</html>`;
}

export function makeDocsRouter(): Hono {
  const router = new Hono();

  // Swagger UI interactive explorer
  router.get("/", (c) => {
    const specUrl = c.req.url.replace(/\/?$/, "/openapi.json");
    return c.html(makeSwaggerHtml(specUrl));
  });

  // OpenAPI 3.1 spec
  router.get("/openapi.json", (c) => {
    return c.json(OPENAPI_SPEC);
  });

  return router;
}
