import { boot } from "@xon/server-core";
import { DEFAULT_PORT } from "@xon/shared";
import { BrowserWindow, app, screen } from "electron";
import { type TrayHandle, createTray } from "./tray.js";

const headless = process.env.XON_HEADLESS === "1" || process.env.XON_HEADLESS === "true";

let mainWindow: BrowserWindow | null = null;
let trayHandle: TrayHandle | null = null;
let isQuitting = false;
// Set to true if either XON_HEADLESS is set or no display server is detected at startup
let runHeadless = headless;

/**
 * Detect whether a display server is available.
 * On Linux: checks DISPLAY (X11) or WAYLAND_DISPLAY environment variables.
 * On macOS: checks Electron's screen module for connected displays (call after app.whenReady).
 * On Windows: always returns true (display is always available).
 */
function hasDisplayServer(): boolean {
  if (process.platform === "linux") {
    return !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  }
  if (process.platform === "win32") {
    return true;
  }
  // macOS: check if any displays are connected via Electron screen API
  try {
    return screen.getAllDisplays().length > 0;
  } catch {
    return false;
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  mainWindow.loadURL(`http://localhost:${port}`);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  boot();

  const displayAvailable = hasDisplayServer();
  runHeadless = headless || !displayAvailable;

  if (!displayAvailable) {
    console.log("No display server detected. Xon desktop activating headless fallback.");
  }

  if (!runHeadless) {
    createWindow();
    trayHandle = createTray();
  } else if (headless) {
    console.log("Xon desktop running in headless mode");
  }

  app.on("activate", () => {
    if (!runHeadless && BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || runHeadless) {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (!isQuitting) {
    isQuitting = true;
    event.preventDefault();
    trayHandle?.destroy();
    // Trigger server-core graceful shutdown; its handler calls process.exit(0)
    process.emit("SIGTERM");
  }
});
