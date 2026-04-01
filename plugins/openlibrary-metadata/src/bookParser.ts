import { basename, dirname } from 'node:path'

export interface ParsedBook {
  isbn?: string | undefined
  title: string
  author?: string | undefined
}

const ISBN10_RE = /\b(\d{9}[\dX])\b/
const ISBN13_RE = /\b(97[89]\d{10})\b/

/** Normalize a raw ISBN string — strip hyphens/spaces. */
function normalizeIsbn(raw: string): string {
  return raw.replace(/[-\s]/g, '')
}

/** Extract a bare ISBN from a filename/path component if present. */
function extractIsbn(text: string): string | undefined {
  // Try raw text first — handles "9780061120084 Title.epub" where space is a word boundary
  const rawM13 = ISBN13_RE.exec(text)
  if (rawM13) return rawM13[1]
  const rawM10 = ISBN10_RE.exec(text)
  if (rawM10) return rawM10[1]
  // Try normalized text — handles hyphenated ISBNs like "978-0-06-112008-4"
  const cleaned = normalizeIsbn(text)
  const m13 = ISBN13_RE.exec(cleaned)
  if (m13) return m13[1]
  const m10 = ISBN10_RE.exec(cleaned)
  if (m10) return m10[1]
  return undefined
}

/**
 * Parse a document file path into structured book metadata.
 *
 * Supports patterns:
 *  - "Author - Title (Year).epub"
 *  - "Title - Author.epub"
 *  - "Title (Year).epub"
 *  - "978-0-06-112008-4 Title.epub" (ISBN prefix)
 *  - "/Author/Title.epub" (directory = author)
 *  - Bare filename "Title.epub"
 */
export function parseBookPath(filePath: string): ParsedBook {
  const filename = basename(filePath)
  // Strip extension
  const stem = filename.replace(/\.[^.]+$/, '')

  // Try to extract ISBN from the stem
  const isbn = extractIsbn(stem)

  // Remove ISBN portion from stem for further parsing
  const withoutIsbn = stem
    .replace(/\b97[89]\d[\d-]{10,}\b/g, '')
    .replace(/\b\d{9}[\dX]\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Try "Author - Title (Year)" or "Title - Author" dash-separated pattern
  const dashParts = withoutIsbn.split(/\s*-\s*/)
  if (dashParts.length >= 2) {
    // Heuristic: if first part looks like a person name (short, mostly letters, no digits)
    const first = dashParts[0]?.trim() ?? ''
    const rest = dashParts.slice(1).join(' - ').trim()
    // Remove trailing year annotation from rest
    const title = rest.replace(/\s*\(\d{4}\)\s*$/, '').trim()

    // Use directory as author fallback
    const dir = basename(dirname(filePath))
    const dirIsRoot = dir === '.' || dir === '/' || dir === ''

    if (first.length > 0 && title.length > 0) {
      return { isbn, title, author: first }
    }
    if (!dirIsRoot) {
      return {
        isbn,
        title: withoutIsbn.replace(/\s*\(\d{4}\)\s*$/, '').trim(),
        author: dir,
      }
    }
    return { isbn, title: withoutIsbn.replace(/\s*\(\d{4}\)\s*$/, '').trim() }
  }

  // No dash separator — try title with optional year in parens
  const titleClean = withoutIsbn.replace(/\s*\(\d{4}\)\s*$/, '').trim()

  // Use parent directory as author if available
  const dir = basename(dirname(filePath))
  const dirIsRoot = dir === '.' || dir === '/' || dir === ''

  if (!dirIsRoot) {
    return { isbn, title: titleClean || stem, author: dir }
  }

  return { isbn, title: titleClean || stem }
}
