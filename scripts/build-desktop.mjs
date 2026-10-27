import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import electronBuilder from 'electron-builder'

const { build, Platform } = electronBuilder
const electronExecutable = path.resolve('node_modules/electron/dist/electron.exe')

if (!existsSync(electronExecutable)) {
  console.log('Electron binaries are missing; running the dependency installer...')
  execFileSync(process.execPath, [path.resolve('node_modules/electron/install.js')], {
    cwd: process.cwd(),
    stdio: 'inherit',
  })
}
if (!existsSync(electronExecutable)) {
  throw new Error(`Electron installation did not create ${electronExecutable}`)
}

try {
  const artifacts = await build({
    targets: Platform.WINDOWS.createTarget(['portable'], 'x64'),
    config: {
      directories: { output: process.env.DESKTOP_OUTPUT || 'release/latest' },
    },
  })
  console.log(`Windows executable generated: ${artifacts.join(', ')}`)
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
