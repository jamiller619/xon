// Registers the .js → .ts resolution hook for Node's native TypeScript execution.
// Used in dev mode to resolve .js import specifiers to their .ts source files.
import { register } from 'node:module'
register('./ts-loader.mjs', import.meta.url)
