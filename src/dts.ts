import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SvgIcon } from './icons.js'
import type { ResolvedSvgSpritesOptions } from './options.js'

function serializeTypeScriptString(value: string): string {
  return JSON.stringify(value)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function literalUnion(values: string[]): string {
  return values.length === 0 ? 'string' : values.map(serializeTypeScriptString).join(' | ')
}

export function generateDtsContent(icons: SvgIcon[], options: ResolvedSvgSpritesOptions): string {
  const names = icons.map(icon => icon.name)
  const ids = icons.map(icon => icon.id)
  const enumMembers = icons.map(icon => `    ${icon.enumMember} = ${serializeTypeScriptString(icon.name)},`).join('\n')

  return `declare module "virtual:svg-sprites" {
  export type ${options.typeName} = ${literalUnion(names)};
  export type SvgIconId = ${literalUnion(ids)};
  export enum ${options.enumName} {
${enumMembers}
  }
  export const svgIconNames: readonly ${options.typeName}[];
  export const iconNames: typeof svgIconNames;
  export const svgIconIds: readonly SvgIconId[];
  export const ids: typeof svgIconIds;
  const defaultExport: typeof svgIconNames;
  export default defaultExport;
}

declare module "virtual:svg-sprites/names" {
  const names: readonly (${literalUnion(names)})[];
  export default names;
}

declare module "virtual:svg-sprites/ids" {
  const ids: readonly (${literalUnion(ids)})[];
  export default ids;
}
`
}

export async function writeDts(
  root: string,
  icons: SvgIcon[],
  options: ResolvedSvgSpritesOptions,
): Promise<string | undefined> {
  if (options.dts === false) return undefined

  const outputPath = path.resolve(root, options.dts)
  const content = generateDtsContent(icons, options)
  let currentContent: string | undefined
  try {
    currentContent = await readFile(outputPath, 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  if (currentContent === content) return outputPath

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, content, 'utf8')
  return outputPath
}