import { boot } from "@xon/server-core";
import { DEFAULT_PORT } from "@xon/shared";
import { BrowserWindow, app } from "electron";

const headless = process.env.XON_HEADLESS === "1" || process.env.XON_HEADLESS === "true";

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

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

  if (!headless) {
    createWindow();
  } else {
    console.log("Xon desktop running in headless mode");
  }

  app.on("activate", () => {
    if (!headless && BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || headless) {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (!isQuitting) {
    isQuitting = true;
    event.preventDefault();
    // Trigger server-core graceful shutdown; its handler calls process.exit(0)
    process.emit("SIGTERM");
  }
});
