import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isPathInside, resolveInputFolder, scanIcons } from '../src/icons.js'

describe('scanIcons', () => {
  let root: string
  let inputFolder: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'svg-sprites-'))
    inputFolder = path.join(root, 'src', 'assets', 'icons')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  async function addFile(relativePath: string, content = '<svg/>') {
    const filePath = path.join(inputFolder, relativePath)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, content)
  }

  it('recursively scans SVG files in stable path order and derives names, IDs, and enum members', async () => {
    await addFile('weather/cloud.svg')
    await addFile('z.svg')
    await addFile('add.svg')
    await addFile('readme.txt')

    const icons = await scanIcons({
      root,
      inputFolder: 'src/assets/icons',
      symbolId: 'icon-[name]',
    })

    expect(icons.map(({ name, id, enumMember, relativePath }) => ({
      name,
      id,
      enumMember,
      relativePath,
    }))).toEqual([
      { name: 'add', id: 'icon-add', enumMember: 'Add', relativePath: 'add.svg' },
      { name: 'cloud', id: 'icon-cloud', enumMember: 'Cloud', relativePath: 'weather/cloud.svg' },
      { name: 'z', id: 'icon-z', enumMember: 'Z', relativePath: 'z.svg' },
    ])
    expect(icons.every(icon => path.isAbsolute(icon.filePath))).toBe(true)
  })

  it('resolves input paths from Vite root and enforces a path boundary', () => {
    const inputPath = resolveInputFolder(root, 'src/assets/icons')

    expect(inputPath).toBe(inputFolder)
    expect(isPathInside(inputPath, path.join(inputPath, 'add.svg'))).toBe(true)
    expect(isPathInside(inputPath, `${inputPath}-backup/add.svg`)).toBe(false)
  })

  it('treats missing and empty input folders as an empty icon list', async () => {
    await expect(scanIcons({ root, inputFolder: 'not-created', symbolId: 'icon-[name]' })).resolves.toEqual([])

    await mkdir(inputFolder, { recursive: true })
    await expect(scanIcons({ root, inputFolder: 'src/assets/icons', symbolId: 'icon-[name]' })).resolves.toEqual([])
  })

  it('reports duplicate icon names found in different subdirectories', async () => {
    await addFile('filled/home.svg')
    await addFile('outline/home.svg')

    await expect(scanIcons({ root, inputFolder: 'src/assets/icons', symbolId: 'icon-[name]' }))
      .rejects.toThrow(/Duplicate icon name "home".*filled[\\/]home\.svg.*outline[\\/]home\.svg/i)
  })

  it('reports duplicate generated symbol IDs', async () => {
    await addFile('add.svg')
    await addFile('close.svg')

    await expect(scanIcons({ root, inputFolder: 'src/assets/icons', symbolId: 'icon' }))
      .rejects.toThrow(/Duplicate symbol ID "icon".*add\.svg.*close\.svg/i)
  })

  it('reports enum-member collisions after PascalCase normalization', async () => {
    await addFile('arrow-left.svg')
    await addFile('arrow_left.svg')

    await expect(scanIcons({ root, inputFolder: 'src/assets/icons', symbolId: 'icon-[name]' }))
      .rejects.toThrow(/Duplicate enum member "ArrowLeft".*arrow-left\.svg.*arrow_left\.svg/i)
  })
})