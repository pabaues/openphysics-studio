import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'

const root = process.cwd()
const output = path.resolve(root, '../../validation')
const port = Number(process.env.UI_TEST_PORT ?? 7101)
const url = `http://127.0.0.1:${port}`
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
  throw new Error(`Port ${port} is already in use; choose another UI_TEST_PORT.`)
} catch (error) {
  if (error instanceof Error && error.message.startsWith(`Port ${port}`)) throw error
}

await mkdir(output, { recursive: true })
const server = spawn(process.execPath, [
  path.join(root, 'node_modules/vite/bin/vite.js'),
  '--host', '127.0.0.1', '--port', String(port), '--strictPort',
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
  const workers = []
  page.on('worker', (worker) => workers.push(worker.url()))
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

  await page.getByRole('button', { name: 'Study 1', exact: true }).click()
  await page.getByLabel('Linear solver').selectOption('direct')
  await page.locator('.compute-button').click()
  await page.waitForFunction(() => document.querySelector('.solver-metric strong')?.textContent === 'DIRECT LDLᵀ' && !document.querySelector('.outdated-label'))
  assert(workers.length > 0, 'Studies must execute in a Web Worker.')
  await page.locator('.compute-button').evaluate((button) => {
    button.click()
    const input = document.querySelector('.document-name')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, 'Stale response guard')
    input?.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.locator('.outdated-label').waitFor()
  await page.waitForTimeout(500)
  assert.equal(await page.locator('.document-name').inputValue(), 'Stale response guard')
  assert(await page.locator('.outdated-label').isVisible(), 'An obsolete Worker response must not replace the edited model signature.')
  await page.getByRole('button', { name: 'Mesh 1', exact: true }).click()
  await page.getByLabel(/Horizontal divisions/).fill('6')
  await page.getByLabel(/Vertical divisions/).fill('4')
  await page.getByRole('button', { name: 'Mesh convergence', exact: true }).click()
  await page.getByLabel('Grid levels').selectOption('2')
  await page.getByRole('button', { name: 'Run convergence study' }).click()
  await page.locator('.convergence-panel').waitFor({ timeout: 60000 })
  assert.equal(await page.locator('.convergence-table tbody tr').count(), 2)
  assert.equal(await page.locator('.solver-metric strong').textContent(), 'DIRECT LDLᵀ')
  await page.screenshot({ path: path.join(output, 'openphysics-direct-convergence.png'), fullPage: true })

  await page.getByLabel('Example model').selectOption('bar')
  await page.locator('.toast.success').waitFor()
  assert.equal(await page.locator('.document-name').inputValue(), 'Insulated conduction bar')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export temperature/ }).click()
  const download = await downloadPromise
  assert.equal(download.suggestedFilename(), 'temperature-field.csv')
  assert.equal(await download.failure(), null)

  await page.getByLabel('Example model').selectOption('electric')
  await page.waitForFunction(() => document.querySelector('.viewport-label')?.textContent?.includes('Electric potential'))
  assert.equal(await page.locator('.document-name').inputValue(), 'Parallel plate capacitor')
  assert.equal(await page.getByLabel('Result quantity').inputValue(), 'potential')
  await page.screenshot({ path: path.join(output, 'openphysics-electrostatics.png'), fullPage: true })
  const electricDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export potential/ }).click()
  const electricDownload = await electricDownloadPromise
  assert.equal(electricDownload.suggestedFilename(), 'electric-potential.csv')
  assert.equal(await electricDownload.failure(), null)

  await page.locator('.ribbon-button').filter({ hasText: 'Geometry' }).click()
  await page.getByLabel('Geometry file').setInputFiles({
    name: 'l-domain.svg', mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 H2 V1 H1 V2 H0 Z" /></svg>'),
  })
  await page.getByText('Simple polygon', { exact: true }).waitFor()
  assert.equal(await page.locator('.selection-card strong').textContent(), '1 domain · 6 boundary segments')
  await page.screenshot({ path: path.join(output, 'openphysics-polygon-geometry.png'), fullPage: true })
  await page.locator('.ribbon-button').filter({ hasText: 'Mesh' }).click()
  assert.equal(await page.getByLabel('Polygon refinement').inputValue(), '1')
  await page.getByLabel('Polygon refinement').focus()
  await page.getByLabel('Polygon refinement').press('ArrowRight')
  assert.equal(await page.getByLabel('Polygon refinement').inputValue(), '2')
  assert.equal(await page.locator('.simulation-canvas polygon:has(title)').count(), 64)
  await page.screenshot({ path: path.join(output, 'openphysics-polygon-mesh.png'), fullPage: true })
  await page.getByLabel('Active physics').selectOption('heat')
  await page.locator('.compute-button').click()
  await page.waitForFunction(() => document.querySelector('.viewport-label')?.textContent?.includes('Temperature field') && !document.querySelector('.outdated-label'))
  const polygonDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export field \+ mesh/ }).click()
  const polygonDownload = await polygonDownloadPromise
  assert.equal(polygonDownload.suggestedFilename(), 'temperature-field.vtk')
  assert.equal(await polygonDownload.failure(), null)
  await page.getByRole('button', { name: 'Mesh convergence', exact: true }).click()
  await page.getByRole('button', { name: 'Run convergence study' }).click()
  await page.locator('.convergence-panel').waitFor({ timeout: 60000 })
  assert.equal(await page.locator('.convergence-table tbody tr').count(), 3)
  assert.equal(await page.locator('.convergence-table tbody tr').first().locator('td').first().textContent(), 'P1 · R2')
  await page.screenshot({ path: path.join(output, 'openphysics-polygon-convergence.png'), fullPage: true })

  await page.getByLabel('Example model').selectOption('tension')
  await page.waitForFunction(() => document.querySelector('.viewport-label')?.textContent?.includes('Displacement magnitude'))
  assert.equal(await page.locator('.document-name').inputValue(), 'Uniaxial tension patch')
  assert.equal(await page.getByLabel('Active physics').inputValue(), 'elasticity')
  assert.equal(await page.getByLabel('Result quantity').inputValue(), 'displacement')
  await page.getByLabel('Result quantity').selectOption('vonMises')
  await page.waitForFunction(() => document.querySelector('.viewport-label')?.textContent?.includes('von Mises stress'))
  await page.screenshot({ path: path.join(output, 'openphysics-elasticity.png'), fullPage: true })
  const structuralDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export displacement \+ von Mises \+ mesh/ }).click()
  const structuralDownload = await structuralDownloadPromise
  assert.equal(structuralDownload.suggestedFilename(), 'structural-displacement.vtk')
  assert.equal(await structuralDownload.failure(), null)
  await page.getByRole('button', { name: 'Mesh convergence', exact: true }).click()
  await page.getByRole('button', { name: 'Run convergence study' }).click()
  await page.locator('.convergence-panel').waitFor({ timeout: 60000 })
  assert.equal(await page.locator('.convergence-table tbody tr').count(), 3)
  await page.screenshot({ path: path.join(output, 'openphysics-elasticity-convergence.png'), fullPage: true })

  await page.getByLabel('Active physics').selectOption('heat')
  await page.getByRole('button', { name: 'Parametric sweep', exact: true }).click()
  assert.equal(await page.getByLabel('Sweep parameter').inputValue(), 'material.conductivity')

  await page.getByLabel('Example model').selectOption('generation')
  await page.waitForFunction(() => document.querySelector('.document-name')?.value === 'Volumetric heating plate' && !document.querySelector('.outdated-label'))
  await page.getByRole('button', { name: 'Mesh convergence', exact: true }).click()
  await page.getByRole('button', { name: 'Run convergence study' }).click()
  await page.locator('.convergence-panel').waitFor({ timeout: 60000 })
  assert.equal(await page.locator('.convergence-table tbody tr').count(), 3)
  assert(Number(await page.locator('.convergence-table tbody tr').last().locator('td').last().textContent()) > 0)
  await page.screenshot({ path: path.join(output, 'openphysics-convergence.png'), fullPage: true })

  await page.getByRole('button', { name: 'Study 1', exact: true }).click()
  await page.getByLabel('Study type').selectOption('transient')
  await page.getByLabel('Duration').fill('2')
  await page.getByLabel('Time steps').fill('20')
  await page.getByLabel('Output intervals').fill('5')
  await page.locator('.compute-button').click()
  await page.locator('.time-control').waitFor({ timeout: 60000 })
  assert.equal(await page.getByLabel('Time frame').getAttribute('max'), '5')
  assert.equal(await page.getByLabel('Time frame').inputValue(), '5')
  await page.getByLabel('Time frame').focus()
  await page.getByLabel('Time frame').press('Home')
  assert.equal(await page.getByLabel('Time frame').inputValue(), '0')
  await page.screenshot({ path: path.join(output, 'openphysics-transient.png'), fullPage: true })
  await page.locator('.results-node').click()
  const reportDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export simulation report/ }).click()
  const reportDownload = await reportDownloadPromise
  assert.equal(reportDownload.suggestedFilename(), 'simulation-report.html')
  assert.equal(await reportDownload.failure(), null)
  const derivedDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export derived values/ }).click()
  const derivedDownload = await derivedDownloadPromise
  assert.equal(derivedDownload.suggestedFilename(), 'derived-values.csv')
  assert.equal(await derivedDownload.failure(), null)

  await page.getByRole('button', { name: 'Parametric sweep', exact: true }).click()
  await page.getByRole('button', { name: 'Run parametric sweep' }).click()
  await page.locator('.sweep-panel').waitFor({ timeout: 60000 })
  assert.equal(await page.locator('.sweep-table tbody tr').count(), 3)
  await page.locator('.sweep-table tbody tr').nth(1).click()
  assert(await page.locator('.sweep-table tbody tr').nth(1).getAttribute('class') === 'active')
  const sweepDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click()
  const sweepDownload = await sweepDownloadPromise
  assert.equal(sweepDownload.suggestedFilename(), 'parametric-sweep.csv')
  assert.equal(await sweepDownload.failure(), null)
  await page.screenshot({ path: path.join(output, 'openphysics-sweep.png'), fullPage: true })

  await page.setViewportSize({ width: 1100, height: 780 })
  await page.screenshot({ path: path.join(output, 'openphysics-compact.png'), fullPage: true })
  assert.deepEqual(errors, [], `Browser errors:\n${errors.join('\n')}`)
  console.log('UI validation passed: thermal, transient, electrostatics, elasticity, SVG polygon import, unstructured VTK/convergence, sweeps, derived values, reports and responsive layout.')
  console.log(`Screenshots: ${output}`)
} finally {
  if (browser) await browser.close()
  server.kill('SIGTERM')
}
