import { DEFAULT_PORT } from "@xon/shared";
import { Menu, Tray, app, nativeImage, shell } from "electron";

export type ServerStatus = "running" | "scanning" | "error";

const STATUS_LABEL: Record<ServerStatus, string> = {
  running: "Xon: Running",
  scanning: "Xon: Scanning",
  error: "Xon: Error",
};

function makeColorIcon(
  r: number,
  g: number,
  b: number
): ReturnType<typeof nativeImage.createFromBuffer> {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4] = b;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = r;
    buf[i * 4 + 3] = 255;
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

function formatUptime(bootTime: Date): string {
  const elapsed = Math.floor((Date.now() - bootTime.getTime()) / 1000);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export interface TrayHandle {
  updateStatus(status: ServerStatus, activeUsers?: number, scanState?: string): void;
  destroy(): void;
}

export function createTray(): TrayHandle {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const bootTime = new Date();
  let status: ServerStatus = "running";
  let activeUsers = 0;
  let scanState = "idle";

  const icons = {
    running: makeColorIcon(0, 200, 0),
    scanning: makeColorIcon(255, 200, 0),
    error: makeColorIcon(200, 0, 0),
  } satisfies Record<ServerStatus, ReturnType<typeof nativeImage.createFromBuffer>>;

  const tray = new Tray(icons.running);

  function refresh(): void {
    const icon = icons[status];
    tray.setImage(icon);
    tray.setToolTip(STATUS_LABEL[status]);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: "Open Web UI",
          click: () => void shell.openExternal(`http://localhost:${port}`),
        },
        { type: "separator" },
        {
          label: `Server Status: uptime ${formatUptime(bootTime)}, users ${activeUsers}, scan ${scanState}`,
          enabled: false,
        },
        { type: "separator" },
        {
          label: "Quit",
          click: () => app.quit(),
        },
      ])
    );
  }

  refresh();

  return {
    updateStatus(newStatus: ServerStatus, newActiveUsers = 0, newScanState = "idle"): void {
      status = newStatus;
      activeUsers = newActiveUsers;
      scanState = newScanState;
      refresh();
    },
    destroy(): void {
      tray.destroy();
    },
  };
}
