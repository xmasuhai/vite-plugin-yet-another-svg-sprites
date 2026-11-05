import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { svgSprites } from '../src/index.js'

interface BrowserSvgState {
  mainNames: string[]
  mainIds: string[]
  names: string[]
  ids: string[]
}

declare global {
  interface Window {
    __svgState?: BrowserSvgState
  }
}

const browserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

describe('browser development integration', () => {
  let browser: Browser
  let context: BrowserContext | undefined
  let page: Page
  let server: ViteDevServer | undefined
  let root: string
  let iconFolder: string
  let pageErrors: string[]

  beforeAll(async () => {
    const executablePath = process.env.SVG_SPRITES_TEST_BROWSER ?? browserCandidates.find(candidate => existsSync(candidate))
    if (!executablePath) throw new Error('Set SVG_SPRITES_TEST_BROWSER to a Chromium browser executable')
    browser = await chromium.launch({ executablePath, headless: true })
  }, 30000)

  afterAll(async () => {
    await browser?.close()
  })

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'svg-sprites-browser-'))
    iconFolder = path.join(root, 'src', 'assets', 'icons')
    await mkdir(iconFolder, { recursive: true })
    await writeFile(path.join(iconFolder, 'add.svg'), '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>')
    await writeFile(path.join(root, 'index.html'), '<html><body><main></main><script type="module" src="/src/main.js"></script></body></html>')
    pageErrors = []
  })

  afterEach(async () => {
    await context?.close()
    await server?.close()
    await rm(root, { recursive: true, force: true })
    context = undefined
    server = undefined
  })

  async function startFixture(updateMode: 'reload' | 'hmr', acceptsUpdates: boolean) {
    const acceptance = acceptsUpdates ? `
      if (import.meta.hot) {
        import.meta.hot.accept([
          'virtual:svg-sprites',
          'virtual:svg-sprites/names',
          'virtual:svg-sprites/ids',
        ], (updates) => {
          if (updates[0]) {
            window.__svgState.mainNames = [...updates[0].default]
            window.__svgState.mainIds = [...updates[0].svgIconIds]
          }
          if (updates[1]) window.__svgState.names = [...updates[1].default]
          if (updates[2]) window.__svgState.ids = [...updates[2].default]
        })
      }
    ` : ''
    await writeFile(path.join(root, 'src', 'main.js'), `
      import mainNames, { svgIconIds } from 'virtual:svg-sprites'
      import names from 'virtual:svg-sprites/names'
      import ids from 'virtual:svg-sprites/ids'
      const loads = Number(sessionStorage.getItem('svg-sprites-loads') || 0) + 1
      sessionStorage.setItem('svg-sprites-loads', String(loads))
      window.__svgState = {
        mainNames: [...mainNames],
        mainIds: [...svgIconIds],
        names: [...names],
        ids: [...ids],
      }
      ${acceptance}
    `)

    server = await createServer({
      configFile: false,
      root,
      logLevel: 'silent',
      plugins: [svgSprites({ updateMode })],
      server: { host: '127.0.0.1', port: 0 },
    })
    await server.listen()
    const address = server.httpServer!.address()
    if (!address || typeof address === 'string') throw new Error('Expected an HTTP server address')
    const connected = new Promise<void>((resolve) => server!.ws.on('connection', () => resolve()))

    context = await browser.newContext()
    page = await context.newPage()
    page.setDefaultTimeout(10000)
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.goto(`http://127.0.0.1:${address.port}/`)
    await connected
    await page.waitForFunction(() => Boolean(window.__svgState))
    await page.waitForSelector('svg[data-svg-sprites] symbol#icon-add', { state: 'attached' })
  }

  async function loadCount(): Promise<number> {
    return page.evaluate(() => Number(sessionStorage.getItem('svg-sprites-loads')))
  }

  it('reload mode updates sprite and exports after add, change, and delete', async () => {
    await startFixture('reload', false)
    const cloud = path.join(iconFolder, 'cloud.svg')
    let loads = await loadCount()

    await writeFile(cloud, '<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>')
    await page.waitForFunction(previous => Number(sessionStorage.getItem('svg-sprites-loads')) > previous, loads)
    await page.waitForSelector('svg[data-svg-sprites] symbol#icon-cloud', { state: 'attached' })
    expect(await page.evaluate(() => window.__svgState?.names ?? [])).toContain('cloud')

    loads = await loadCount()
    await writeFile(cloud, '<svg viewBox="0 0 24 24"><path d="M2 2"/></svg>')
    await page.waitForFunction(previous => Number(sessionStorage.getItem('svg-sprites-loads')) > previous, loads)
    await page.waitForFunction(() => document.querySelector('symbol#icon-cloud path')?.getAttribute('d') === 'M2 2')

    loads = await loadCount()
    await unlink(cloud)
    await page.waitForFunction(previous => Number(sessionStorage.getItem('svg-sprites-loads')) > previous, loads)
    await page.waitForFunction(() => document.querySelector('symbol#icon-cloud') === null)
    expect(await page.locator('svg[data-svg-sprites]').count()).toBe(1)
    expect(pageErrors).toEqual([])
  }, 30000)

  it('HMR mode preserves the page and synchronizes DOM and all runtime exports', async () => {
    await startFixture('hmr', true)
    const cloud = path.join(iconFolder, 'cloud.svg')
    const loads = await loadCount()

    await writeFile(cloud, '<svg viewBox="0 0 24 24"><path d="M3 3"/></svg>')
    await page.waitForFunction(() => {
      const state = window.__svgState
      if (!state) return false
      return state.mainNames.includes('cloud') && state.mainIds.includes('icon-cloud')
        && state.names.includes('cloud') && state.ids.includes('icon-cloud')
        && document.querySelector('symbol#icon-cloud') !== null
    })
    expect(await loadCount()).toBe(loads)

    await writeFile(cloud, '<svg viewBox="0 0 24 24"><path d="M5 5"/></svg>')
    await page.waitForFunction(() => document.querySelector('symbol#icon-cloud path')?.getAttribute('d') === 'M5 5')
    expect(await loadCount()).toBe(loads)

    await unlink(cloud)
    await page.waitForFunction(() => {
      const state = window.__svgState
      if (!state) return false
      return !state.mainNames.includes('cloud') && !state.mainIds.includes('icon-cloud')
        && !state.names.includes('cloud') && !state.ids.includes('icon-cloud')
        && document.querySelector('symbol#icon-cloud') === null
    })
    expect(await loadCount()).toBe(loads)
    expect(await page.locator('svg[data-svg-sprites]').count()).toBe(1)
    expect(pageErrors).toEqual([])
  }, 30000)

  it('HMR mode reloads the browser when no importer accepts the update', async () => {
    await startFixture('hmr', false)
    const loads = await loadCount()
    await writeFile(path.join(iconFolder, 'add.svg'), '<svg viewBox="0 0 24 24"><path d="M7 7"/></svg>')

    await page.waitForFunction(previous => Number(sessionStorage.getItem('svg-sprites-loads')) > previous, loads)
    await page.waitForFunction(() => document.querySelector('symbol#icon-add path')?.getAttribute('d') === 'M7 7')
    expect(pageErrors).toEqual([])
  }, 30000)
})