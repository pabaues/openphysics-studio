import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'

const root = process.cwd()
const output = path.resolve(root, '../../validation')
const url = 'http://127.0.0.1:7100'
const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean)
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate))
assert(executablePath, 'Chrome or Edge is required for UI validation.')

try {
  await fetch(url, { signal: AbortSignal.timeout(500) })
  throw new Error('Port 7100 is already in use; stop the existing server before validation.')
} catch (error) {
  if (error instanceof Error && error.message.startsWith('Port 7100')) throw error
}

await mkdir(output, { recursive: true })
const server = spawn(process.execPath, [
  path.join(root, 'node_modules/vite/bin/vite.js'),
  '--host', '127.0.0.1', '--port', '7100', '--strictPort',
], { cwd: root, stdio: 'pipe' })
let serverOutput = ''
server.stdout.on('data', (chunk) => { serverOutput += String(chunk) })
server.stderr.on('data', (chunk) => { serverOutput += String(chunk) })
let browser

try {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Vite exited early:\n${serverOutput}`)
    try {
      const response = await fetch(url)
      if (response.ok) break
    } catch { /* Vite is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto(url, { waitUntil: 'networkidle' })
  assert.equal(await page.title(), 'OpenPhysics Studio')
  await page.locator('.solver-metric .converged').waitFor()
  assert((await page.locator('.simulation-canvas polygon').count()) > 800)
  assert.equal(await page.locator('#colorScale stop').first().getAttribute('stop-color'), '#253494')
  assert.equal(await page.locator('#colorScale stop').last().getAttribute('stop-color'), '#800026')
  await page.screenshot({ path: path.join(output, 'openphysics-desktop.png'), fullPage: true })

  await page.locator('.view-tabs button').filter({ hasText: 'Mesh' }).click()
  await page.locator('.viewport-label').filter({ hasText: 'Mesh 1' }).waitFor()
  await page.locator('.ribbon-button').filter({ hasText: 'Geometry' }).click()
  await page.getByLabel('Width').fill('0.12')
  await page.locator('.outdated-label').waitFor()
  await page.locator('.compute-button').click()
  await page.locator('.toast.success').waitFor()
  await page.locator('.outdated-label').waitFor({ state: 'detached' })

  await page.getByLabel('Example model').selectOption('bar')
  await page.locator('.toast.success').waitFor()
  assert.equal(await page.locator('.document-name').inputValue(), 'Insulated conduction bar')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export temperature/ }).click()
  const download = await downloadPromise
  assert.equal(download.suggestedFilename(), 'temperature-field.csv')
  assert.equal(await download.failure(), null)

  await page.setViewportSize({ width: 1100, height: 780 })
  await page.screenshot({ path: path.join(output, 'openphysics-compact.png'), fullPage: true })
  assert.deepEqual(errors, [], `Browser errors:\n${errors.join('\n')}`)
  console.log('UI validation passed: render, mesh, edit, compute, preset, export, responsive layout.')
  console.log(`Screenshots: ${output}`)
} finally {
  if (browser) await browser.close()
  server.kill('SIGTERM')
}
