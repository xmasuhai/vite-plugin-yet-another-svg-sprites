import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { IconScanOptions } from './options.js'

export interface SvgIcon {
  name: string
  id: string
  enumMember: string
  filePath: string
  relativePath: string
  content: string
}

export function resolveInputFolder(root: string, inputFolder: string): string {
  return path.resolve(root, inputFolder)
}

export function isPathInside(parent: string, candidate: string): boolean {
  const relativePath = path.relative(path.resolve(parent), path.resolve(candidate))

  return relativePath === ''
    || (!path.isAbsolute(relativePath) && relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`))
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function toEnumMember(name: string): string {
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? []
  const member = words.map(word => word[0].toUpperCase() + word.slice(1)).join('')

  return /^[\p{L}_$]/u.test(member) ? member : `Icon${member}`
}

function throwOnDuplicates(icons: Omit<SvgIcon, 'content'>[]): void {
  const seenNames = new Map<string, string>()
  const seenIds = new Map<string, string>()
  const seenEnumMembers = new Map<string, string>()

  for (const icon of icons) {
    const checks: [Map<string, string>, string, string][] = [
      [seenNames, icon.name, 'icon name'],
      [seenIds, icon.id, 'symbol ID'],
      [seenEnumMembers, icon.enumMember, 'enum member'],
    ]

    for (const [seen, value, label] of checks) {
      const previousPath = seen.get(value)
      if (previousPath) {
        throw new Error(
          `Duplicate ${label} ${JSON.stringify(value)} in ${previousPath} and ${icon.filePath}`,
        )
      }
      seen.set(value, icon.filePath)
    }
  }
}

async function collectSvgFiles(folder: string, files: string[]): Promise<void> {
  let entries
  try {
    entries = await readdir(folder, { withFileTypes: true })
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }

  entries.sort((left, right) => comparePaths(left.name, right.name))

  for (const entry of entries) {
    const filePath = path.join(folder, entry.name)
    if (entry.isDirectory()) {
      await collectSvgFiles(filePath, files)
    }
    else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.svg') {
      files.push(filePath)
    }
  }
}

export async function scanIcons(options: IconScanOptions): Promise<SvgIcon[]> {
  const inputPath = resolveInputFolder(options.root, options.inputFolder)
  const filePaths: string[] = []
  await collectSvgFiles(inputPath, filePaths)

  const metadata = filePaths
    .map((filePath) => {
      const name = path.basename(filePath, path.extname(filePath))
      const relativePath = path.relative(inputPath, filePath).split(path.sep).join('/')

      return {
        name,
        id: options.symbolId.replaceAll('[name]', name),
        enumMember: toEnumMember(name),
        filePath,
        relativePath,
      }
    })
    .sort((left, right) => comparePaths(left.relativePath, right.relativePath))

  throwOnDuplicates(metadata)

  const icons: SvgIcon[] = []
  for (const icon of metadata) {
    icons.push({
      ...icon,
      content: await readFile(icon.filePath, 'utf8'),
    })
  }

  return icons
}