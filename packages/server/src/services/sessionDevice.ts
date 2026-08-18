export type SessionDeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown'

export type SessionDevice = {
  type: SessionDeviceType
  label: string
  browser: string
  operatingSystem: string
}

function browserName(userAgent: string): string {
  if (/Edg(?:A|iOS)?\//i.test(userAgent)) return 'Microsoft Edge'
  if (/(?:OPR|Opera)\//i.test(userAgent)) return 'Opera'
  if (/(?:Firefox|FxiOS)\//i.test(userAgent)) return 'Firefox'
  if (/(?:Chrome|CriOS)\//i.test(userAgent)) return 'Chrome'
  if (/Version\/[\d.]+.*Safari/i.test(userAgent)) return 'Safari'

  return 'Unknown browser'
}

function operatingSystemName(userAgent: string): string {
  if (/Windows/i.test(userAgent)) return 'Windows'
  if (/Android/i.test(userAgent)) return 'Android'
  if (/iPhone|iPad|iPod|CPU(?: iPhone)? OS/i.test(userAgent)) return 'iOS'
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'macOS'
  if (/CrOS/i.test(userAgent)) return 'ChromeOS'
  if (/Linux/i.test(userAgent)) return 'Linux'

  return 'Unknown operating system'
}

function deviceType(userAgent: string): SessionDeviceType {
  if (/iPad|Tablet|PlayBook|Silk/i.test(userAgent)) return 'tablet'
  if (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent)) return 'tablet'
  if (/Mobi|iPhone|iPod|Android/i.test(userAgent)) return 'mobile'
  if (/Windows|Macintosh|Linux|CrOS/i.test(userAgent)) return 'desktop'
  return 'unknown'
}

export function parseSessionDevice(rawUserAgent: string | null): SessionDevice {
  const userAgent = rawUserAgent?.trim() ?? ''
  if (!userAgent) {
    return {
      type: 'unknown',
      label: 'Unknown device',
      browser: 'Unknown browser',
      operatingSystem: 'Unknown operating system',
    }
  }

  const browser = browserName(userAgent)
  const operatingSystem = operatingSystemName(userAgent)
  const type = deviceType(userAgent)
  const knownBrowser = browser !== 'Unknown browser'
  const knownOS = operatingSystem !== 'Unknown operating system'
  const label = knownBrowser
    ? knownOS
      ? `${operatingSystem} · ${browser}`
      : browser
    : knownOS
      ? operatingSystem
      : 'Unknown device'

  return { type, label, browser, operatingSystem }
}
