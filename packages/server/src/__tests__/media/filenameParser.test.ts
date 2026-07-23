import { describe, expect, it } from 'vitest'
import {
  normalizeMediaTitle,
  parseFilename,
} from '../../media/filenameParser.ts'

describe('parseFilename', () => {
  it('removes the file extension from a plain movie filename', () => {
    expect(
      parseFilename('b/Movies/The Social Network/The Social Network.avi').title,
    ).toBe('The Social Network')
  })

  it('keeps parsed year metadata while cleaning release punctuation', () => {
    const result = parseFilename('/movies/The.Matrix.1999.1080p.BluRay.mkv')

    expect(result.title).toBe('The Matrix')
    expect(result.metadata.year).toBe('1999')
  })

  it('retains unicode letters and numbers', () => {
    expect(parseFilename('/movies/Amélie.2001.mkv').title).toBe('Amélie')
  })
})

describe('normalizeMediaTitle', () => {
  it('repairs a legacy title containing its source extension', () => {
    expect(normalizeMediaTitle('The Social Network.avi', '.avi')).toBe(
      'The Social Network',
    )
  })

  it('collapses special characters and separators into spaces', () => {
    expect(normalizeMediaTitle('Spider-Man_[No.Way.Home]')).toBe(
      'Spider Man No Way Home',
    )
  })
})
