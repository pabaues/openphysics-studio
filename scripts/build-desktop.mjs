import electronBuilder from 'electron-builder'

const { build, Platform } = electronBuilder

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
