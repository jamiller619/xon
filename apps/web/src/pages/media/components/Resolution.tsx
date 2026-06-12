type ResolutionProps = {
  width: number
  height: number
  layout?: string
}

export default function Resolution({
  width,
  height,
  layout = '$n $a ($cn)',
}: ResolutionProps) {
  const res = getResolution(width, height)

  if (!res) return null

  return layout
    .replace('$n', res.name)
    .replace('$a', res.abbr)
    .replace('$cn', res.commonName)
}

const RESOLUTIONS = [
  {
    name: '8K',
    abbr: 'UHD',
    commonName: 'Ultra High Definition',
    height: 4320,
    minLongEdge: 5760,
  },
  {
    name: '4K',
    abbr: 'UHD',
    commonName: 'Ultra High Definition',
    height: 2160,
    minLongEdge: 3200,
  },
  {
    name: '1440p',
    abbr: 'QHD',
    commonName: 'Quad High Definition',
    height: 1440,
    minLongEdge: 2240,
  },
  {
    name: '1080p',
    abbr: 'FHD',
    commonName: 'Full High Definition',
    height: 1080,
    minLongEdge: 1600,
  },
  {
    name: '720p',
    abbr: 'HD',
    commonName: 'High Definition',
    height: 720,
    minLongEdge: 1067,
  },
  {
    name: '480p',
    abbr: 'SD',
    commonName: 'Standard Definition',
    height: 480,
    minLongEdge: 747,
  },
  {
    name: '360p',
    abbr: 'SD',
    commonName: 'Standard Definition',
    height: 360,
    minLongEdge: 533,
  },
  {
    name: '240p',
    abbr: 'SD',
    commonName: 'Standard Definition',
    height: 240,
    minLongEdge: 0,
  },
]

type Resolution = (typeof RESOLUTIONS)[number]

function getResolution(width = 0, height = 0): Resolution | undefined {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    return

  const longEdge = Math.max(width, height)

  // The 0-floor tier guarantees a match.
  return RESOLUTIONS.find((t) => longEdge >= t.minLongEdge)
}
