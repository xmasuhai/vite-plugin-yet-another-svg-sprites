import { generate, ident, parse, walk } from 'css-tree'
import svgstore from 'svgstore'
import { optimize } from 'svgo'
import type { SvgIcon } from './icons.js'
import type { SvgSpritesOptions } from './options.js'

const defaultPlugins = [
  'cleanupAttrs',
  'removeDoctype',
  'removeComments',
  'removeTitle',
  { name: 'removeDesc', params: { removeAny: true } },
  'removeEmptyAttrs',
  { name: 'removeAttrs', params: { attrs: '(data-name|fill)' } },
] satisfies NonNullable<import('svgo').Config['plugins']>

function optimizeIcon(icon: SvgIcon, options: SvgSpritesOptions): string {
  if (options.noOptimizeList?.includes(icon.name)) return icon.content

  const config = options.svgoConfig
  return optimize(icon.content, {
    ...config,
    path: icon.filePath,
    ...(!config ? { plugins: defaultPlugins } : {}),
  }).data
}

function namespaceStyleSelectors(content: string, ids: Map<string, string>, filePath: string): string {
  const cdata = content.match(/^(\s*<!\[CDATA\[)([\s\S]*?)(]]>\s*)$/)
  try {
    const stylesheet = parse(cdata ? cdata[2] : content, { parseValue: true, parseCustomProperty: false })
    walk(stylesheet, (node) => {
      if (node.type !== 'IdSelector') return
      const namespacedId = ids.get(ident.decode(node.name))
      if (namespacedId) node.name = namespacedId
    })
    const result = generate(stylesheet)
    return cdata ? `${cdata[1]}${result}${cdata[3]}` : result
  }
  catch (error) {
    throw new Error(`Failed to namespace SVG styles in ${filePath}`, { cause: error })
  }
}

function safeIdPart(value: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(value)) return value
  return `id_${Array.from(value, character => character.codePointAt(0)!.toString(16)).join('_')}`
}

function namespaceIds(svg: string, prefix: string, filePath: string, usedIds: Set<string>): string {
  const ids = new Map<string, string>()
  for (const match of svg.matchAll(/(\s+id\s*=\s*)(["'])(.*?)\2/g)) {
    const originalId = match[3]
    if (ids.has(originalId)) continue
    const baseId = `${safeIdPart(prefix)}_${safeIdPart(originalId)}`
    let namespacedId = baseId
    let suffix = 1
    while (usedIds.has(namespacedId)) namespacedId = `${baseId}__${suffix++}`
    usedIds.add(namespacedId)
    ids.set(originalId, namespacedId)
  }

  if (ids.size === 0) return svg
  const timingIds = [...ids.entries()].sort(([left], [right]) => right.length - left.length)

  return svg
    .replace(/(\s+id\s*=\s*)(["'])(.*?)\2/g, (attribute, start, quote, id: string) => {
      return `${start}${quote}${ids.get(id) ?? id}${quote}`
    })
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi, (element, start, content: string, end) => {
      return `${start}${namespaceStyleSelectors(content, ids, filePath)}${end}`
    })
    .replace(/url\(\s*(["']?)#([^)'"\s]+)\1\s*\)/g, (reference, quote, id: string) => {
      const namespacedId = ids.get(id)
      return namespacedId ? `url(${quote}#${namespacedId}${quote})` : reference
    })
    .replace(/(\s+(?:xlink:)?href\s*=\s*)(["'])#([^"']+)\2/g, (reference, start, quote, id: string) => {
      const namespacedId = ids.get(id)
      return namespacedId ? `${start}${quote}#${namespacedId}${quote}` : reference
    })
    .replace(/(\s+(?:begin|end)\s*=\s*)(["'])(.*?)\2/g, (attribute, start, quote, value: string) => {
      const namespacedValue = value.split(';').map((part) => {
        const trimmed = part.trimStart()
        const whitespace = part.slice(0, part.length - trimmed.length)
        for (const [id, namespacedId] of timingIds) {
          if (trimmed.startsWith(`${id}.`)) return `${whitespace}${namespacedId}${trimmed.slice(id.length)}`
        }
        return part
      }).join(';')
      return `${start}${quote}${namespacedValue}${quote}`
    })
    .replace(/(\s+(?:aria-labelledby|aria-describedby|aria-owns|aria-controls|aria-details|aria-errormessage|aria-flowto)\s*=\s*)(["'])(.*?)\2/gi, (attribute, start, quote, value: string) => {
      const namespacedValue = value
        .split(/\s+/)
        .map(id => ids.get(id) ?? id)
        .join(' ')
      return `${start}${quote}${namespacedValue}${quote}`
    })
}

export function generateSprite(icons: SvgIcon[], options: SvgSpritesOptions = {}): string {
  const inline = options.inline ?? false
  const sprites = svgstore({ inline })
  const usedIds = new Set(icons.map(icon => icon.id))

  for (const icon of icons) {
    sprites.add(icon.id, namespaceIds(optimizeIcon(icon, options), icon.id, icon.filePath, usedIds))
  }

  return sprites.toString({ inline })
}
