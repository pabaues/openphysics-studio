import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { _electron as electron } from 'playwright-core'

const root = process.cwd()
const output = path.resolve(root, '../../validation')
const executablePath = process.env.DESKTOP_EXECUTABLE
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE
await mkdir(output, { recursive: true })

let application
try {
  application = await electron.launch({
    executablePath: executablePath || path.join(root, 'node_modules/electron/dist/electron.exe'),
    args: executablePath ? [] : ['.'],
    cwd: root,
    env: environment,
    timeout: 120000,
  })
  const page = await application.firstWindow({ timeout: 60000 })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.waitForLoadState('domcontentloaded')
  await page.locator('.solver-metric .converged').waitFor({ timeout: 60000 })
  assert.equal(await page.title(), 'OpenPhysics Studio')
  assert(page.url().startsWith('file://'), 'The desktop application must load its local bundled files.')

  const metadata = await application.evaluate(({ app }) => ({
    version: app.getVersion(),
    packaged: app.isPackaged,
  }))
  assert.equal(metadata.version, packageJson.version)
  assert.equal(metadata.packaged, Boolean(executablePath))

  await page.locator('.compute-button').click()
  await page.locator('.toast.success').waitFor({ timeout: 60000 })
  await page.getByLabel('Example model').selectOption('composite')
  await page.waitForFunction(() => document.querySelector('.document-name')?.value === 'Two-material composite plate' && !document.querySelector('.outdated-label'), { timeout: 60000 })
  await page.locator('.ribbon-button').filter({ hasText: 'Geometry' }).click()
  assert.equal(await page.getByLabel('Active domain').locator('option').count(), 2)
  await page.screenshot({ path: path.join(output, 'openphysics-desktop-app.png'), fullPage: true })
  assert.deepEqual(errors, [], `Desktop browser errors:\n${errors.join('\n')}`)
  console.log(`Desktop validation passed (${metadata.packaged ? 'packaged executable' : 'unpacked application'}, version ${metadata.version}).`)
  console.log(`Screenshot: ${path.join(output, 'openphysics-desktop-app.png')}`)
} finally {
  if (application) await application.close()
}
