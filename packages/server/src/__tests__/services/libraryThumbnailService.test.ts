import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { applyLibraryThumbnailPerspective } from '../../services/libraryThumbnailService.ts'

describe('library thumbnail perspective', () => {
  it('bakes the library card projection into a 4:3 PNG', async () => {
    const input = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 220, g: 60, b: 40 },
      },
    })
      .composite([
        {
          input: {
            create: {
              width: 200,
              height: 200,
              channels: 3,
              background: { r: 30, g: 180, b: 90 },
            },
          },
          left: 0,
          top: 0,
        },
      ])
      .png()
      .toBuffer()

    const output = await applyLibraryThumbnailPerspective(input)
    const { data, info } = await sharp(output)
      .raw()
      .toBuffer({ resolveWithObject: true })

    expect(info).toMatchObject({ width: 800, height: 600, channels: 3 })
    expect((await sharp(output).metadata()).format).toBe('png')

    const unprojected = await sharp(input)
      .resize(800, 600, { fit: 'cover' })
      .raw()
      .toBuffer()
    expect(data.equals(unprojected)).toBe(false)
  })
})
