import nanoidGood from 'nanoid-good'
import english from 'nanoid-good/locale/en.js'

export const PUBLIC_ID_LENGTH = 12
export const PUBLIC_ID_ALPHABET = '346789abcdefghijkmnpqrtwxyz'
export const PUBLIC_ID_MAX_INSERT_ATTEMPTS = 5

const createPublicId = nanoidGood.customAlphabet(english)(
  PUBLIC_ID_ALPHABET,
  PUBLIC_ID_LENGTH,
)

export function generatePublicId(): string {
  return createPublicId()
}

export function isGeneratedPublicId(value: string): boolean {
  return (
    value.length === PUBLIC_ID_LENGTH &&
    [...value].every((character) => PUBLIC_ID_ALPHABET.includes(character))
  )
}

export async function insertWithGeneratedPublicId<T>(
  insert: (publicId: string) => Promise<T>,
  generate: () => string = generatePublicId,
): Promise<T> {
  let lastCollision: unknown

  for (let attempt = 0; attempt < PUBLIC_ID_MAX_INSERT_ATTEMPTS; attempt++) {
    try {
      return await insert(generate())
    } catch (error) {
      if (!isPublicIdUniqueConflict(error)) throw error
      lastCollision = error
    }
  }

  throw new Error(
    `Could not allocate a unique public ID after ${PUBLIC_ID_MAX_INSERT_ATTEMPTS} attempts`,
    { cause: lastCollision },
  )
}

function isPublicIdUniqueConflict(error: unknown): boolean {
  let current = error
  for (let depth = 0; current && depth < 6; depth++) {
    const message =
      current instanceof Error
        ? current.message
        : typeof current === 'object' && 'message' in current
          ? String(current.message)
          : String(current)
    if (/unique/i.test(message) && /public_id/i.test(message)) return true
    current =
      typeof current === 'object' && 'cause' in current
        ? current.cause
        : undefined
  }
  return false
}
