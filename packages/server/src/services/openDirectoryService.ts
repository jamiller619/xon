import { spawn } from 'node:child_process'
import { dirname } from 'node:path'

type FileBrowserCommand = {
  command: string
  args: string[]
}

export function getFileBrowserCommand(
  filePath: string,
  platform = process.platform,
): FileBrowserCommand {
  if (platform === 'darwin') {
    return { command: 'open', args: ['-R', filePath] }
  }

  if (platform === 'win32') {
    return { command: 'explorer.exe', args: [`/select,${filePath}`] }
  }

  if (platform === 'linux') {
    return { command: 'xdg-open', args: [dirname(filePath)] }
  }

  throw new Error(
    `Opening the native file browser is not supported on ${platform}`,
  )
}

export function openInFileBrowser(filePath: string): Promise<void> {
  const { command, args } = getFileBrowserCommand(filePath)

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    })

    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
