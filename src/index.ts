import path from 'node:path'
import type { Plugin } from 'vite'
import { isPathInside, resolveInputFolder, scanIcons, type SvgIcon } from './icons.js'
import { writeDts } from './dts.js'
import { buildVirtualModule, getPublicModuleId, resolveVirtualModule, SPRITE_UPDATE_EVENT, VIRTUAL_MODULES } from './modules.js'
import type { SvgSpritesOptions } from './options.js'
import { resolveOptions } from './options.js'
import { generateSprite } from './sprite.js'

export type { SvgSpritesOptions } from './options.js'

const PLUGIN_NAME = 'vite-plugin-yet-another-svg-sprites'

export function svgSprites(options: SvgSpritesOptions = {}): Plugin {
  const resolvedOptions = resolveOptions(options)
  let root = process.cwd()
  let inputPath = ''
  let icons: SvgIcon[] = []

  return {
    name: PLUGIN_NAME,
    async configResolved(config) {
      if ((config.plugins?.filter(plugin => plugin.name === PLUGIN_NAME).length ?? 0) > 1) {
        throw new Error('Only one SVG sprites plugin instance is supported per Vite configuration')
      }
      root = config.root
      inputPath = resolveInputFolder(root, resolvedOptions.inputFolder)
      icons = await scanIcons({
        root,
        inputFolder: resolvedOptions.inputFolder,
        symbolId: resolvedOptions.symbolId,
      })
      await writeDts(root, icons, resolvedOptions)
    },
    configureServer(server) {
      server.watcher.add(inputPath)
    },
    resolveId(id) {
      return resolveVirtualModule(id)
    },
    load(id) {
      const publicId = getPublicModuleId(id)
      if (!publicId) return null
      return buildVirtualModule(publicId, icons, resolvedOptions)
    },
    async hotUpdate(update) {
      const filePath = path.resolve(update.file)
      if (!inputPath || !isPathInside(inputPath, filePath) || path.extname(filePath).toLowerCase() !== '.svg') return
      if (this.environment.name !== 'client') return []

      const nextIcons = await scanIcons({
        root,
        inputFolder: resolvedOptions.inputFolder,
        symbolId: resolvedOptions.symbolId,
      })
      await writeDts(root, nextIcons, resolvedOptions)
      icons = nextIcons

      const graph = update.server.environments.client.moduleGraph
      const modules = Object.values(VIRTUAL_MODULES)
        .map(id => graph.getModuleById(resolveVirtualModule(id)!))
        .filter(module => module !== undefined)

      if (resolvedOptions.updateMode === 'reload') {
        for (const module of modules) graph.invalidateModule(module)
        update.server.environments.client.hot.send({ type: 'full-reload', path: '*' })
        return []
      }

      update.server.environments.client.hot.send({
        type: 'custom',
        event: SPRITE_UPDATE_EVENT,
        data: { sprite: generateSprite(icons, resolvedOptions) },
      })
      return modules
    },
  }
}