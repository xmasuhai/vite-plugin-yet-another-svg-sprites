import type { Config as SvgoConfig } from 'svgo'

export interface IconScanOptions {
  root: string
  inputFolder: string
  symbolId: string
}

export interface SvgSpritesOptions {
  inputFolder?: string
  symbolId?: string
  noOptimizeList?: string[]
  svgoConfig?: SvgoConfig
  inline?: boolean
  dts?: boolean | string
  enumName?: string
  typeName?: string
  updateMode?: 'reload' | 'hmr'
}

export interface ResolvedSvgSpritesOptions {
  inputFolder: string
  symbolId: string
  noOptimizeList: string[]
  svgoConfig?: SvgoConfig
  inline: boolean
  dts: false | string
  enumName: string
  typeName: string
  updateMode: 'reload' | 'hmr'
}

const identifierPattern = /^[$_\p{ID_Start}][$\u200C\u200D_\p{ID_Continue}]*$/u
const reservedIdentifiers = new Set([
  'abstract', 'any', 'as', 'asserts', 'async', 'await', 'boolean', 'break', 'case', 'catch', 'class',
  'const', 'constructor', 'continue', 'debugger', 'declare', 'default', 'delete', 'do', 'else', 'enum',
  'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'get', 'if', 'implements', 'import',
  'in', 'infer', 'instanceof', 'interface', 'is', 'keyof', 'let', 'module', 'namespace', 'never', 'new',
  'null', 'number', 'object', 'of', 'package', 'private', 'protected', 'public', 'readonly', 'require',
  'return', 'set', 'static', 'string', 'super', 'switch', 'symbol', 'this', 'throw', 'true', 'try', 'type',
  'typeof', 'undefined', 'unique', 'unknown', 'var', 'void', 'while', 'with', 'yield',
])

function assertTypeScriptIdentifier(name: string, optionName: string): void {
  if (!identifierPattern.test(name) || reservedIdentifiers.has(name)) {
    throw new Error(`Option "${optionName}" must be a valid TypeScript identifier; received ${JSON.stringify(name)}`)
  }
}

export function resolveOptions(options: SvgSpritesOptions = {}): ResolvedSvgSpritesOptions {
  const resolved: ResolvedSvgSpritesOptions = {
    inputFolder: options.inputFolder ?? 'src/assets/icons',
    symbolId: options.symbolId ?? 'icon-[name]',
    noOptimizeList: [...(options.noOptimizeList ?? [])],
    svgoConfig: options.svgoConfig,
    inline: options.inline ?? false,
    dts: options.dts === false
      ? false
      : typeof options.dts === 'string'
        ? options.dts
        : 'src/types/svg-icons.d.ts',
    enumName: options.enumName ?? 'SvgIconEnum',
    typeName: options.typeName ?? 'SvgIconName',
    updateMode: options.updateMode ?? 'reload',
  }

  assertTypeScriptIdentifier(resolved.enumName, 'enumName')
  assertTypeScriptIdentifier(resolved.typeName, 'typeName')

  if (resolved.enumName === resolved.typeName || resolved.enumName === 'SvgIconId' || resolved.enumName === 'svgIconNames'
    || resolved.enumName === 'iconNames' || resolved.enumName === 'svgIconIds' || resolved.enumName === 'ids') {
    throw new Error('Options "enumName" and "typeName" must be different and must not conflict with generated exports')
  }
  if (resolved.typeName === 'SvgIconId') {
    throw new Error('Option "typeName" must not conflict with the generated SvgIconId type')
  }

  return resolved
}