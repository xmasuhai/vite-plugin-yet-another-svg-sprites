import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import type { SvgIcon } from '../src/icons.js'
import { generateSprite } from '../src/sprite.js'
import {
  buildIdsModule,
  buildMainModule,
  buildNamesModule,
  getPublicModuleId,
  resolveVirtualModule,
  VIRTUAL_MODULES,
} from '../src/modules.js'
import type { SvgSpritesOptions } from '../src/options.js'

const icons: SvgIcon[] = [
  { name: 'add', id: 'icon-add', enumMember: 'Add', filePath: 'add.svg', relativePath: 'add.svg', content: '<svg/>' },
  { name: 'cloud', id: 'icon-cloud', enumMember: 'Cloud', filePath: 'cloud.svg', relativePath: 'cloud.svg', content: '<svg/>' },
]

describe('virtual modules', () => {
  it('resolves the main, names, and IDs module IDs', () => {
    expect(resolveVirtualModule(VIRTUAL_MODULES.main)).toBe('\0virtual:svg-sprites')
    expect(resolveVirtualModule(VIRTUAL_MODULES.names)).toBe('\0virtual:svg-sprites/names')
    expect(resolveVirtualModule(VIRTUAL_MODULES.ids)).toBe('\0virtual:svg-sprites/ids')
    expect(resolveVirtualModule('virtual:other')).toBeUndefined()
    expect(getPublicModuleId('\0virtual:svg-sprites/names')).toBe(VIRTUAL_MODULES.names)
  })

  it('exports immutable names, IDs, aliases, and the configured enum from the main module', () => {
    const options: SvgSpritesOptions = { enumName: 'IconKinds' }
    const code = buildMainModule('<svg/>', icons, options)

    expect(code).toContain('export const IconKinds = Object.freeze({"Add":"add","Cloud":"cloud"})')
    expect(code).toContain('export const svgIconNames = Object.freeze(["add","cloud"])')
    expect(code).toContain('export const svgIconIds = Object.freeze(["icon-add","icon-cloud"])')
    expect(code).toContain('export default svgIconNames')
    expect(code).toContain('data-svg-sprites')
  })

  it('keeps the names and IDs modules free of DOM injection code', () => {
    const namesCode = buildNamesModule(icons)
    const idsCode = buildIdsModule(icons)

    expect(namesCode).toContain('export default Object.freeze(["add","cloud"])')
    expect(idsCode).toContain('export default Object.freeze(["icon-add","icon-cloud"])')
    expect(namesCode).not.toContain('document')
    expect(idsCode).not.toContain('document')
  })

  it('safely serializes special names, IDs, and sprite content without interpolation', async () => {
    const specialValue = 'quote" backtick` ${globalThis.__svgSpritesPwned = true}'
    const specialIcon: SvgIcon = {
      ...icons[0],
      name: specialValue,
      id: specialValue,
    }
    const code = buildMainModule(`<svg><text>${specialValue}</text></svg>`, [specialIcon])
    const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
    const previousValue = (globalThis as typeof globalThis & { __svgSpritesPwned?: boolean }).__svgSpritesPwned

    try {
      const module = await import(url)
      expect(module.default).toEqual([specialValue])
      expect(module.svgIconIds).toEqual([specialValue])
      expect(module.svgIconNames).toEqual([specialValue])
      expect(module.iconNames).toBe(module.svgIconNames)
      expect(module.ids).toBe(module.svgIconIds)
      expect(module.SvgIconEnum).toEqual({ Add: specialValue })
      expect((globalThis as typeof globalThis & { __svgSpritesPwned?: boolean }).__svgSpritesPwned).toBe(previousValue)
    }
    finally {
      delete (globalThis as typeof globalThis & { __svgSpritesPwned?: boolean }).__svgSpritesPwned
    }
  })

  it('injects only one hidden sprite when the main module executes repeatedly', async () => {
    const dom = new JSDOM('<!doctype html><html><body><main></main></body></html>')
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document })
    const code = buildMainModule(generateSprite(icons), icons)
    const encoded = Buffer.from(code).toString('base64')

    try {
      await import(`data:text/javascript;base64,${encoded}#first`)
      await import(`data:text/javascript;base64,${encoded}#second`)

      expect(dom.window.document.querySelectorAll('svg[data-svg-sprites]')).toHaveLength(1)
      expect(dom.window.document.querySelector('svg[data-svg-sprites]')?.getAttribute('aria-hidden')).toBe('true')
    }
    finally {
      if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
      else Reflect.deleteProperty(globalThis, 'document')
      dom.window.close()
    }
  })

  it('waits for the body before injecting the sprite', async () => {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>')
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
    const body = dom.window.document.body
    body.remove()
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document })
    const code = buildMainModule('<svg><symbol id="icon-add"></symbol></svg>', icons)

    try {
      await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#without-body`)
      expect(dom.window.document.querySelector('svg[data-svg-sprites]')).toBeNull()

      dom.window.document.documentElement.append(body)
      dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'))
      expect(dom.window.document.querySelectorAll('svg[data-svg-sprites]')).toHaveLength(1)
    }
    finally {
      if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
      else Reflect.deleteProperty(globalThis, 'document')
      dom.window.close()
    }
  })

  it('updates the injected sprite through the HMR event and removes its listener on dispose', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>')
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
    const previousHot = Object.getOwnPropertyDescriptor(globalThis, '__svgSpritesHot')
    const listeners = new Map<string, (data: { sprite: string }) => void>()
    const disposers: Array<() => void> = []
    const hot = {
      on(event: string, listener: (data: { sprite: string }) => void) {
        listeners.set(event, listener)
      },
      off(event: string, listener: (data: { sprite: string }) => void) {
        if (listeners.get(event) === listener) listeners.delete(event)
      },
      dispose(callback: () => void) {
        disposers.push(callback)
      },
    }
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document })
    Object.defineProperty(globalThis, '__svgSpritesHot', { configurable: true, value: hot })
    const code = buildMainModule(generateSprite(icons, { inline: true }), icons, { updateMode: 'hmr' })
      .replaceAll('import.meta.hot', 'globalThis.__svgSpritesHot')

    try {
      await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
      expect(dom.window.document.querySelector('svg[data-svg-sprites] symbol#icon-add')).not.toBeNull()

      const onUpdate = listeners.get('vite-plugin-yet-another-svg-sprites:update')
      expect(onUpdate).toBeDefined()
      onUpdate?.({
        sprite: generateSprite([
          ...icons,
          { name: 'new', id: 'icon-new', enumMember: 'New', filePath: 'new.svg', relativePath: 'new.svg', content: '<svg/>' },
        ], { inline: true }),
      })

      expect(dom.window.document.querySelectorAll('svg[data-svg-sprites]')).toHaveLength(1)
      expect(dom.window.document.querySelector('svg[data-svg-sprites] symbol#icon-new')).not.toBeNull()
      expect(disposers).toHaveLength(1)
      disposers[0]()
      expect(listeners.size).toBe(0)
    }
    finally {
      if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
      else Reflect.deleteProperty(globalThis, 'document')
      if (previousHot) Object.defineProperty(globalThis, '__svgSpritesHot', previousHot)
      else Reflect.deleteProperty(globalThis, '__svgSpritesHot')
      dom.window.close()
    }
  })

  it('can be imported when no document global exists', async () => {
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
    Reflect.deleteProperty(globalThis, 'document')
    const code = buildMainModule('<svg/>', icons)

    try {
      const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
      expect(module.default).toEqual(['add', 'cloud'])
    }
    finally {
      if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
    }
  })
})