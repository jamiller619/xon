import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MediaClassifier } from '../../scanner/classifier.ts'

describe('MediaClassifier', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'xon-classifier-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  async function addFile(relativePath: string) {
    const filePath = path.join(root, relativePath)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, '')
  }

  it('recognizes TV episode naming before generic video evidence', async () => {
    await addFile('Series/Season 01/Example.S01E03.1080p.mkv')

    const result = await new MediaClassifier().classify([root])

    expect(result.type).toBe('video/tvshow')
    expect(result.confidence).toBe(1)
    expect(result.mixed).toBe(false)
  })

  it('recognizes movie folders and movie-style years', async () => {
    await addFile('Movies/Arrival (2016)/Arrival.2016.mkv')
    await addFile('Movies/Contact (1997)/Contact.1997.mp4')

    const result = await new MediaClassifier({ sampleRatio: 1 }).classify([
      root,
    ])

    expect(result.type).toBe('video/movie')
    expect(result.breakdown).toEqual({ 'video/movie': 2 })
  })

  it('chooses the major type while preserving mixed-content evidence', async () => {
    for (let index = 0; index < 6; index += 1) {
      await addFile(`Music/Track ${index}.flac`)
    }
    for (let index = 0; index < 4; index += 1) {
      await addFile(`Photos/Photo ${index}.jpg`)
    }

    const result = await new MediaClassifier({ sampleRatio: 1 }).classify([
      root,
    ])

    expect(result.type).toBe('audio')
    expect(result.mixed).toBe(true)
    expect(result.percentages).toEqual({ audio: 0.6, image: 0.4 })
  })

  it('combines evidence from multiple library folders', async () => {
    const secondRoot = await mkdtemp(
      path.join(tmpdir(), 'xon-classifier-second-'),
    )
    try {
      await addFile('Album/Track 1.mp3')
      await writeFile(path.join(secondRoot, 'Track 2.m4a'), '')

      const result = await new MediaClassifier({ sampleRatio: 1 }).classify([
        root,
        secondRoot,
      ])

      expect(result.type).toBe('audio')
      expect(result.relevantFiles).toBe(2)
    } finally {
      await rm(secondRoot, { recursive: true, force: true })
    }
  })

  it('ignores sidecars and reports when no supported media is available', async () => {
    await addFile('Movie.en.srt')
    await addFile('README')

    const result = await new MediaClassifier().classify([root])

    expect(result.type).toBeUndefined()
    expect(result.filesFound).toBe(2)
    expect(result.relevantFiles).toBe(0)
    expect(result.ignoredSidecars).toBe(1)
  })

  it('reports unreadable folders without rejecting other usable folders', async () => {
    await addFile('Photo.jpg')
    const missing = path.join(root, 'missing')

    const result = await new MediaClassifier().classify([missing, root])

    expect(result.type).toBe('image')
    expect(result.unreadablePaths).toEqual([missing])
  })
})
