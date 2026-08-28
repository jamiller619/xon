import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveMediaItemFilePath = vi.hoisted(() => vi.fn())
const isRawImage = vi.hoisted(() => vi.fn())
const convertRawToJpeg = vi.hoisted(() => vi.fn())
const needsTranscoding = vi.hoisted(() => vi.fn())

vi.mock('../../media/mediaFilePaths.ts', () => ({ resolveMediaItemFilePath }))
vi.mock('../../media/raw.ts', () => ({ isRawImage, convertRawToJpeg }))
vi.mock('../../media/transcode.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../media/transcode.ts')>()),
  needsTranscoding,
}))

const { getMediaStreamDecision } = await import(
  '../../services/mediaStreamingService.ts'
)

describe('mediaStreamingService', () => {
  beforeEach(() => {
    resolveMediaItemFilePath.mockResolvedValue('/media/item')
    isRawImage.mockReturnValue(false)
    convertRawToJpeg.mockReset()
    needsTranscoding.mockReset()
    needsTranscoding.mockReturnValue(true)
  })

  it('never asks the transcoder about a non-audio/video item', async () => {
    const result = await getMediaStreamDecision(
      itemDatabase('image/jpeg'),
      'media-1',
      'web',
    )

    expect(result.status).toBe('direct')
    expect(needsTranscoding).not.toHaveBeenCalled()
  })

  it('returns an HLS decision for an unsupported video profile', async () => {
    const result = await getMediaStreamDecision(
      itemDatabase('video/x-matroska'),
      'media-1',
      'web',
    )

    expect(result).toEqual({ status: 'hls' })
    expect(needsTranscoding).toHaveBeenCalledOnce()
  })

  it('checks music metadata as an audio codec rather than a video codec', async () => {
    needsTranscoding.mockReturnValue(false)

    const result = await getMediaStreamDecision(
      itemDatabase('audio/mpeg', {
        codec: 'MPEG 1 Layer 3',
      }),
      'media-1',
      'web',
    )

    expect(result.status).toBe('direct')
    expect(needsTranscoding).toHaveBeenCalledWith(
      {
        mediaType: 'audio/mpeg',
        videoCodec: undefined,
        audioCodec: 'MPEG 1 Layer 3',
      },
      'web',
    )
  })
})

function itemDatabase(
  mediaType: string,
  fileMetadata = { codec: 'h264', audioCodec: 'aac' },
): LibSQLDatabase {
  const item = {
    id: 'media-1',
    filePath: 'item',
    fileSize: 1,
    fileMetadata,
    mediaType,
    metadata: {},
  }
  return {
    select: () => ({
      from: () => ({ where: async () => [item] }),
    }),
  } as unknown as LibSQLDatabase
}
