import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SvgIcon } from '../src/icons.js'
import { generateDtsContent, writeDts } from '../src/dts.js'
import { resolveOptions } from '../src/options.js'

const icons: SvgIcon[] = [
  { name: 'add', id: 'icon-add', enumMember: 'Add', filePath: 'add.svg', relativePath: 'add.svg', content: '<svg/>' },
  { name: 'cloud', id: 'icon-cloud', enumMember: 'Cloud', filePath: 'cloud.svg', relativePath: 'cloud.svg', content: '<svg/>' },
]

describe('SVG sprite declarations', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'svg-sprites-dts-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('generates name and ID unions, the configured enum, and all module declarations', () => {
    const content = generateDtsContent(icons, resolveOptions({ enumName: 'IconKinds', typeName: 'IconName' }))

    expect(content).toContain('export type IconName = "add" | "cloud"')
    expect(content).toContain('export type SvgIconId = "icon-add" | "icon-cloud"')
    expect(content).toContain('export enum IconKinds')
    expect(content).toContain('Add = "add"')
    expect(content).toContain('declare module "virtual:svg-sprites/names"')
    expect(content).toContain('declare module "virtual:svg-sprites/ids"')
    expect(content).toContain('readonly IconName[]')
  })

  it('uses string types for empty directories and safely quotes special values', () => {
    const specialIcon: SvgIcon = {
      ...icons[0],
      name: 'a"b\\c\n${notCode}',
      id: 'id"value',
    }
    const specialContent = generateDtsContent([specialIcon], resolveOptions())
    const emptyContent = generateDtsContent([], resolveOptions())

    expect(specialContent).toContain('"a\\"b\\\\c\\n${notCode}"')
    expect(specialContent).toContain('"id\\"value"')
    expect(emptyContent).toContain('export type SvgIconName = string')
    expect(emptyContent).toContain('export type SvgIconId = string')
  })

  it('writes declarations to the default and custom paths but supports disabling generation', async () => {
    await expect(writeDts(root, icons, resolveOptions())).resolves.toBe(path.join(root, 'src', 'types', 'svg-icons.d.ts'))
    await expect(readFile(path.join(root, 'src', 'types', 'svg-icons.d.ts'), 'utf8'))
      .resolves.toContain('export type SvgIconName')

    await expect(writeDts(root, icons, resolveOptions({ dts: 'types/custom.d.ts' })))
      .resolves.toBe(path.join(root, 'types', 'custom.d.ts'))
    await expect(writeDts(root, icons, resolveOptions({ dts: false }))).resolves.toBeUndefined()
  })

  it('produces declarations that type-check for the runtime and standalone module exports', async () => {
    const content = generateDtsContent(icons, resolveOptions())
    const declarationPath = path.join(root, 'svg-icons.d.ts')
    const consumerPath = path.join(root, 'consumer.ts')
    await mkdir(root, { recursive: true })
    await writeFile(declarationPath, content)
    await writeFile(consumerPath, `
      import names, { SvgIconEnum, type SvgIconName, type SvgIconId } from 'virtual:svg-sprites'
      import onlyNames from 'virtual:svg-sprites/names'
      import onlyIds from 'virtual:svg-sprites/ids'
      const name: SvgIconName = names[0]
      const id: SvgIconId = onlyIds[0]
      const enumValue: SvgIconEnum = SvgIconEnum.Add
      const namesAreReadonly: readonly string[] = onlyNames
      // @ts-expect-error unknown icon names are rejected
      const invalidName: SvgIconName = 'missing'
      void [name, id, enumValue, namesAreReadonly, invalidName]
    `)

    const compilerArgs = [
      '--ignoreConfig',
      '--noEmit',
      '--strict',
      '--target',
      'ESNext',
      '--module',
      'ESNext',
      '--moduleResolution',
      'Bundler',
      declarationPath,
      consumerPath,
    ]
    let compilerOutput = ''
    try {
      compilerOutput = execFileSync(process.execPath, [
        path.resolve(process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc'),
        ...compilerArgs,
      ], { cwd: process.cwd(), encoding: 'utf8' })
    }
    catch (error) {
      const commandError = error as Error & { stdout?: string | Buffer; stderr?: string | Buffer }
      compilerOutput = `${commandError.stdout ?? ''}${commandError.stderr ?? ''}`
    }

    expect(compilerOutput).toBe('')
  })
})