function browserName(userAgent: string): string | null {
  if (/Edg(?:A|iOS)?\//i.test(userAgent)) return 'Microsoft Edge'
  if (/(?:OPR|Opera)\//i.test(userAgent)) return 'Opera'
  if (/(?:Firefox|FxiOS)\//i.test(userAgent)) return 'Firefox'
  if (/(?:Chrome|CriOS)\//i.test(userAgent)) return 'Chrome'
  if (/Version\/[\d.]+.*Safari/i.test(userAgent)) return 'Safari'
  return null
}

export function formatWebClientName(userAgent: string): string {
  if (/iPhone/i.test(userAgent)) return 'iPhone - Web'
  if (/iPad/i.test(userAgent)) return 'iPad - Web'
  if (/Android/i.test(userAgent)) return 'Android - Web'

  const browser = browserName(userAgent)
  return browser ? `${browser} - Web` : 'Web'
}

export function getWebClientName(): string {
  return formatWebClientName(
    typeof navigator === 'undefined' ? '' : navigator.userAgent,
  )
}
