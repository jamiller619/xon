/**
 * A lightweight implementation similar to Node.js path.basename().
 *
 * Examples:
 * basename('/foo/bar/baz.txt')      -> 'baz.txt'
 * basename('/foo/bar/')             -> 'bar'
 * basename('C:\\foo\\bar\\file.js') -> 'file.js'
 * basename('file.txt')              -> 'file.txt'
 * basename('')                      -> ''
 */
export default function basename(path: string): string {
  if (path.length === 0) {
    return ''
  }

  let end = path.length - 1

  // Skip trailing slashes/backslashes
  while (end >= 0) {
    const char = path[end]

    if (char !== '/' && char !== '\\') {
      break
    }

    end--
  }

  // Path was only slashes
  if (end < 0) {
    return ''
  }

  let start = end

  // Find previous separator
  while (start >= 0) {
    const char = path[start]

    if (char === '/' || char === '\\') {
      break
    }

    start--
  }

  return path.slice(start + 1, end + 1)
}
