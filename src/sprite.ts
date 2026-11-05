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

function namespaceIds(svg: string, prefix: string): string {
  const ids = new Map<string, string>()
  for (const match of svg.matchAll(/(\s+id\s*=\s*)(["'])(.*?)\2/g)) {
    ids.set(match[3], `${prefix}_${match[3]}`)
  }

  if (ids.size === 0) return svg

  return svg
    .replace(/(\s+id\s*=\s*)(["'])(.*?)\2/g, (attribute, start, quote, id: string) => {
      return `${start}${quote}${ids.get(id) ?? id}${quote}`
    })
    .replace(/url\(\s*(["']?)#([^)'"\s]+)\1\s*\)/g, (reference, quote, id: string) => {
      const namespacedId = ids.get(id)
      return namespacedId ? `url(${quote}#${namespacedId}${quote})` : reference
    })
    .replace(/(\s+(?:xlink:)?href\s*=\s*)(["'])#([^"']+)\2/g, (reference, start, quote, id: string) => {
      const namespacedId = ids.get(id)
      return namespacedId ? `${start}${quote}#${namespacedId}${quote}` : reference
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

  for (const icon of icons) {
    sprites.add(icon.id, namespaceIds(optimizeIcon(icon, options), icon.id))
  }

  return sprites.toString({ inline })
}