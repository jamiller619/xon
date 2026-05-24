import { eventBus, type XonEvent } from '@xon/server'
import { DEFAULT_PORT } from '@xon/shared'
import { Notification, shell } from 'electron'

export type NotificationType =
  | 'scan:complete'
  | 'media:added'
  | 'backup:complete'
  | 'error'

export type NotificationPrefs = Record<NotificationType, boolean>

export interface NotificationManager {
  getPrefs(): NotificationPrefs
  setPref(type: NotificationType, enabled: boolean): void
  destroy(): void
}

const DEFAULT_PREFS: NotificationPrefs = {
  'scan:complete': true,
  'media:added': true,
  'backup:complete': true,
  error: true,
}

export function createNotificationManager(): NotificationManager {
  const port = Number(process.env.PORT ?? DEFAULT_PORT)
  const prefs: NotificationPrefs = { ...DEFAULT_PREFS }

  function baseUrl(): string {
    return `http://localhost:${port}`
  }

  function showNotification(title: string, body: string, url: string): void {
    if (!Notification.isSupported()) return
    const n = new Notification({ title, body })
    n.on('click', () => {
      void shell.openExternal(url)
    })
    n.show()
  }

  function handleEvent(event: XonEvent): void {
    if (event.type === 'scan:complete' && prefs['scan:complete']) {
      const { newItems, updatedItems, removedItems } = event.payload
      showNotification(
        'Scan Complete',
        `${newItems} added, ${updatedItems} updated, ${removedItems} removed`,
        `${baseUrl()}/admin/libraries`,
      )
    } else if (event.type === 'media:added' && prefs['media:added']) {
      showNotification(
        'New Media Detected',
        'New media has been added to your library',
        `${baseUrl()}/admin/libraries`,
      )
    } else if (event.type === 'backup:complete' && prefs['backup:complete']) {
      const mb = (event.payload.sizeBytes / 1024 / 1024).toFixed(1)
      showNotification(
        'Backup Complete',
        `Backup finished (${mb} MB)`,
        `${baseUrl()}/admin/health`,
      )
    } else if (
      (event.type === 'scan:error' ||
        event.type === 'backup:error' ||
        event.type === 'restore:error' ||
        event.type === 'backup:media:error' ||
        event.type === 'backup:verify:error') &&
      prefs.error
    ) {
      const errorMessage =
        'error' in event.payload ? event.payload.error : 'An error occurred'
      showNotification('Xon Error', errorMessage, `${baseUrl()}/admin/health`)
    }
  }

  eventBus.on('event', handleEvent)

  return {
    getPrefs(): NotificationPrefs {
      return { ...prefs }
    },
    setPref(type: NotificationType, enabled: boolean): void {
      prefs[type] = enabled
    },
    destroy(): void {
      eventBus.off('event', handleEvent)
    },
  }
}
