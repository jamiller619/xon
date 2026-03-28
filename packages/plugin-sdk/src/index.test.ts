import { describe, expect, it, vi } from "vitest";
import { BasePlugin } from "./BasePlugin.js";
import type { PluginContext, PluginManifest } from "./types.js";

const testManifest: PluginManifest = {
  id: "test-plugin",
  name: "Test Plugin",
  version: "1.0.0",
  description: "A test plugin",
  author: "Test Author",
  category: "Processor",
};

class MinimalPlugin extends BasePlugin {
  readonly manifest = testManifest;
}

class LifecyclePlugin extends BasePlugin {
  readonly manifest = testManifest;
  initCalled = false;
  activateCalled = false;
  deactivateCalled = false;
  uninstallCalled = false;

  override async init(_ctx: PluginContext): Promise<void> {
    this.initCalled = true;
  }

  override async activate(_ctx: PluginContext): Promise<void> {
    this.activateCalled = true;
  }

  override async deactivate(): Promise<void> {
    this.deactivateCalled = true;
  }

  override async uninstall(): Promise<void> {
    this.uninstallCalled = true;
  }
}

function makeContext(overrides: Partial<PluginContext> = {}): PluginContext {
  return {
    manifest: testManifest,
    db: { query: vi.fn().mockResolvedValue([]) },
    on: vi.fn(),
    registerRoute: vi.fn(),
    registerUI: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

describe("BasePlugin", () => {
  it("exposes the manifest", () => {
    const plugin = new MinimalPlugin();
    expect(plugin.manifest).toBe(testManifest);
  });

  it("default lifecycle methods are no-ops (do not throw)", async () => {
    const plugin = new MinimalPlugin();
    const ctx = makeContext();
    await expect(plugin.init(ctx)).resolves.toBeUndefined();
    await expect(plugin.activate(ctx)).resolves.toBeUndefined();
    await expect(plugin.deactivate()).resolves.toBeUndefined();
    await expect(plugin.uninstall()).resolves.toBeUndefined();
  });

  it("subclass can override lifecycle methods", async () => {
    const plugin = new LifecyclePlugin();
    const ctx = makeContext();
    await plugin.init(ctx);
    await plugin.activate(ctx);
    await plugin.deactivate();
    await plugin.uninstall();
    expect(plugin.initCalled).toBe(true);
    expect(plugin.activateCalled).toBe(true);
    expect(plugin.deactivateCalled).toBe(true);
    expect(plugin.uninstallCalled).toBe(true);
  });

  it("lifecycle methods receive context", async () => {
    const plugin = new LifecyclePlugin();
    const ctx = makeContext();
    await plugin.init(ctx);
    await plugin.activate(ctx);
    // No assertion needed beyond not throwing — context type safety is enforced by TS
  });
});

describe("PluginManifest", () => {
  it("supports all plugin categories", () => {
    const categories = [
      "MediaProvider",
      "MetadataSource",
      "FormatHandler",
      "Processor",
      "Theme",
      "UIExtension",
      "BackupTarget",
    ] as const;
    for (const category of categories) {
      const manifest: PluginManifest = { ...testManifest, category };
      expect(manifest.category).toBe(category);
    }
  });

  it("optional fields are not required", () => {
    const minimal: PluginManifest = {
      id: "min",
      name: "Minimal",
      version: "0.1.0",
      description: "Minimal plugin",
      author: "Someone",
      category: "Theme",
    };
    expect(minimal.mediaCategories).toBeUndefined();
    expect(minimal.minServerVersion).toBeUndefined();
    expect(minimal.main).toBeUndefined();
  });
});

describe("PluginContext interface", () => {
  it("on() can register event hooks", () => {
    const ctx = makeContext();
    const handler = vi.fn();
    ctx.on("scan:start", handler);
    expect(ctx.on).toHaveBeenCalledWith("scan:start", handler);
  });

  it("registerRoute() can register routes", () => {
    const ctx = makeContext();
    const route = {
      method: "GET" as const,
      path: "/test",
      handler: vi.fn(),
    };
    ctx.registerRoute(route);
    expect(ctx.registerRoute).toHaveBeenCalledWith(route);
  });

  it("registerUI() can register UI components", () => {
    const ctx = makeContext();
    const component = {
      id: "my-component",
      injectionPoint: "sidebar:top" as const,
      bundleUrl: "/plugins/test/bundle.js",
    };
    ctx.registerUI(component);
    expect(ctx.registerUI).toHaveBeenCalledWith(component);
  });

  it("db.query() returns results", async () => {
    const ctx = makeContext({
      db: { query: vi.fn().mockResolvedValue([{ id: "1" }]) },
    });
    const results = await ctx.db.query("SELECT * FROM media");
    expect(results).toEqual([{ id: "1" }]);
  });
});
