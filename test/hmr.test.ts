import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { svgSprites } from '../src/index.js'

interface HotMessage {
  type?: string
  event?: string
  data?: { sprite?: string }
  updates?: Array<{ acceptedPath?: string; path?: string; timestamp?: number }>
}

describe('Vite development updates', () => {
  let root: string
  let server: ViteDevServer | undefined
  let plugin: ReturnType<typeof svgSprites>

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'svg-sprites-hmr-'))
    await mkdir(path.join(root, 'src', 'assets', 'icons'), { recursive: true })
    await writeFile(path.join(root, 'index.html'), '<html><body><script type="module" src="/src/main.ts"></script></body></html>')
    await writeFile(path.join(root, 'src', 'assets', 'icons', 'add.svg'), '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>')
  })

  afterEach(async () => {
    await server?.close()
    await rm(root, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  async function startServer(updateMode: 'reload' | 'hmr', acceptsUpdates: boolean) {
    plugin = svgSprites({ inputFolder: 'src/assets/icons', dts: 'src/generated-icons.d.ts', updateMode })
    const acceptance = acceptsUpdates
      ? `if (import.meta.hot) import.meta.hot.accept('virtual:svg-sprites', () => {})`
      : ''
    await writeFile(path.join(root, 'src', 'main.ts'), `
      import icons from 'virtual:svg-sprites'
      ${acceptance}
      export const currentIcons = icons
    `)

    server = await createServer({
      configFile: false,
      root,
      appType: 'custom',
      logLevel: 'silent',
      plugins: [plugin],
      server: { host: '127.0.0.1', port: 0 },
    })
    await server.listen()
    await server.transformRequest('/src/main.ts')

    const virtualModule = server.environments.client.moduleGraph.getModuleById('\0virtual:svg-sprites')
    expect(virtualModule).toBeDefined()
    await server.transformRequest(virtualModule!.url)
  }

  function watchMessages() {
    const send = vi.spyOn(server!.environments.client.hot, 'send')
    return () => send.mock.calls.map(([message]) => message as HotMessage)
  }

  async function waitForMessage(readMessages: () => HotMessage[], predicate: (message: HotMessage) => boolean) {
    await vi.waitFor(() => {
      const currentMessages = readMessages()
      if (!currentMessages.some(predicate)) {
        throw new Error(`Expected HMR payload not received; observed: ${JSON.stringify(currentMessages)}`)
      }
    }, { timeout: 5000, interval: 25 })
  }

  it('reload mode refreshes after add, change, and unlink and keeps declarations synchronized', async () => {
    await startServer('reload', false)
    const messages = watchMessages()
    const iconFolder = path.join(root, 'src', 'assets', 'icons')
    const addedIcon = path.join(iconFolder, 'cloud.svg')

    await writeFile(addedIcon, '<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>')
    await waitForMessage(messages, message => message.type === 'full-reload')
    expect(await readFile(path.join(root, 'src', 'generated-icons.d.ts'), 'utf8')).toContain('"cloud"')
    expect(loadModule('\0virtual:svg-sprites/names')).toContain('"cloud"')

    const reloadsAfterAdd = messages().filter(message => message.type === 'full-reload').length
    await writeFile(addedIcon, '<svg viewBox="0 0 24 24"><path d="M2 2"/></svg>')
    await vi.waitFor(() => {
      expect(messages().filter(message => message.type === 'full-reload').length).toBeGreaterThan(reloadsAfterAdd)
    }, { timeout: 5000, interval: 25 })
    expect(loadModule('\0virtual:svg-sprites')).toContain('M2 2')

    const reloadsAfterChange = messages().filter(message => message.type === 'full-reload').length
    await unlink(addedIcon)
    await vi.waitFor(() => {
      expect(messages().filter(message => message.type === 'full-reload').length).toBeGreaterThan(reloadsAfterChange)
    }, { timeout: 5000, interval: 25 })
    expect(await readFile(path.join(root, 'src', 'generated-icons.d.ts'), 'utf8')).not.toContain('"cloud"')
    expect(loadModule('\0virtual:svg-sprites/names')).not.toContain('"cloud"')
  }, 15000)

  function loadModule(id: string): string {
    return (plugin.load as (id: string) => string)(id)
  }

  it('detects an icon directory and SVG created after the server starts', async () => {
    const iconFolder = path.join(root, 'src', 'assets', 'icons')
    await rm(iconFolder, { recursive: true, force: true })
    await startServer('reload', false)
    const messages = watchMessages()

    await mkdir(iconFolder, { recursive: true })
    await writeFile(path.join(iconFolder, 'new.svg'), '<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>')
    await waitForMessage(messages, message => message.type === 'full-reload')
    expect(await readFile(path.join(root, 'src', 'generated-icons.d.ts'), 'utf8')).toContain('"new"')
    expect(loadModule('\0virtual:svg-sprites/names')).toContain('"new"')
  }, 15000)

  it('HMR mode updates sprite data and propagates virtual module exports to an accepting importer', async () => {
    await startServer('hmr', true)
    const messages = watchMessages()
    const iconPath = path.join(root, 'src', 'assets', 'icons', 'cloud.svg')

    await writeFile(iconPath, '<svg viewBox="0 0 24 24"><path d="M3 3"/></svg>')

    await waitForMessage(messages, message => message.type === 'custom'
      && message.event === 'vite-plugin-yet-another-svg-sprites:update'
      && message.data?.sprite?.includes('M3 3') === true)
    await waitForMessage(messages, message => message.type === 'update'
      && message.updates?.some(update => update.path?.includes('main.ts') === true
        && update.acceptedPath === '\0virtual:svg-sprites') === true)

    const update = messages().find(message => message.type === 'update')?.updates?.[0]
    const address = server!.httpServer!.address()
    if (!address || typeof address === 'string') throw new Error('Expected an HTTP server address')
    const response = await fetch(`http://127.0.0.1:${address.port}/@id/__x00__virtual:svg-sprites?t=${update?.timestamp}`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('"cloud"')
    expect(await readFile(path.join(root, 'src', 'generated-icons.d.ts'), 'utf8')).toContain('"cloud"')

    const updatesAfterAdd = messages().filter(message => message.type === 'update').length
    await writeFile(iconPath, '<svg viewBox="0 0 24 24"><path d="M5 5"/></svg>')
    await waitForMessage(messages, message => message.type === 'custom'
      && message.data?.sprite?.includes('M5 5') === true)
    await vi.waitFor(() => {
      expect(messages().filter(message => message.type === 'update').length).toBeGreaterThan(updatesAfterAdd)
    }, { timeout: 5000, interval: 25 })

    const updatesAfterChange = messages().filter(message => message.type === 'update').length
    await unlink(iconPath)
    await vi.waitFor(() => {
      expect(messages().filter(message => message.type === 'update').length).toBeGreaterThan(updatesAfterChange)
    }, { timeout: 5000, interval: 25 })
    expect(await readFile(path.join(root, 'src', 'generated-icons.d.ts'), 'utf8')).not.toContain('"cloud"')
  }, 15000)

  it('HMR mode falls back to a full reload without an accepting importer', async () => {
    await startServer('hmr', false)
    const messages = watchMessages()
    const iconPath = path.join(root, 'src', 'assets', 'icons', 'add.svg')

    await writeFile(iconPath, '<svg viewBox="0 0 24 24"><path d="M4 4"/></svg>')
    await waitForMessage(messages, message => message.type === 'full-reload')
    expect(messages().some(message => message.type === 'custom'
      && message.event === 'vite-plugin-yet-another-svg-sprites:update')).toBe(true)
  }, 15000)
})