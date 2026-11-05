import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { ResolvedConfig } from 'vite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { svgSprites } from '../src/index.js'

describe('svgSprites plugin', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'svg-sprites-plugin-'))
    const iconFolder = path.join(root, 'assets', 'icons')
    await mkdir(path.join(iconFolder, 'weather'), { recursive: true })
    await writeFile(path.join(iconFolder, 'add.svg'), '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>')
    await writeFile(path.join(iconFolder, 'weather', 'cloud.svg'), '<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('connects Vite virtual module hooks to the scanned list and generated declarations', async () => {
    const plugin = svgSprites({ inputFolder: 'assets/icons', dts: 'types/svg-icons.d.ts' })
    const configResolved = plugin.configResolved as (config: ResolvedConfig) => void | Promise<void>
    const resolveId = plugin.resolveId as (id: string) => string | undefined
    const load = plugin.load as (id: string) => string | null | undefined

    await configResolved({ root } as ResolvedConfig)

    const mainId = resolveId('virtual:svg-sprites')
    const namesId = resolveId('virtual:svg-sprites/names')
    const idsId = resolveId('virtual:svg-sprites/ids')
    expect(mainId).toBe('\0virtual:svg-sprites')
    expect(namesId).toBe('\0virtual:svg-sprites/names')
    expect(idsId).toBe('\0virtual:svg-sprites/ids')
    expect(resolveId('virtual:not-svg-sprites')).toBeUndefined()

    const mainModule = load(mainId!)!
    const namesModule = load(namesId!)!
    const idsModule = load(idsId!)!
    expect(mainModule).toContain(String.raw`id=\"icon-add\"`)
    expect(mainModule).toContain(String.raw`id=\"icon-cloud\"`)
    expect(mainModule).toContain('export const svgIconNames = Object.freeze(["add","cloud"])')
    expect(namesModule).toContain('export default Object.freeze(["add","cloud"])')
    expect(namesModule).not.toContain('document')
    expect(idsModule).toContain('export default Object.freeze(["icon-add","icon-cloud"])')
    await expect(readFile(path.join(root, 'types', 'svg-icons.d.ts'), 'utf8'))
      .resolves.toContain('export enum SvgIconEnum')
  })

  it('returns null for unrelated module loads and can disable declaration output', async () => {
    const plugin = svgSprites({ inputFolder: 'assets/icons', dts: false })
    const configResolved = plugin.configResolved as (config: ResolvedConfig) => void | Promise<void>
    const load = plugin.load as (id: string) => string | null | undefined

    await configResolved({ root } as ResolvedConfig)
    expect(load('\0virtual:unknown')).toBeNull()
    await expect(readFile(path.join(root, 'src', 'types', 'svg-icons.d.ts'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})