// Custom ESM loader hook: resolves .js specifiers to .ts when the .js file doesn't exist.
// Required because Node's native --experimental-transform-types doesn't do this fallback
// for files loaded transitively through package export conditions.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' && specifier.endsWith('.js')) {
      return nextResolve(specifier.slice(0, -3) + '.ts', context)
    }
    throw err
  }
}
