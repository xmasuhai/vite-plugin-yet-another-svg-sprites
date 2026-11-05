import { execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function runPnpm(args: string[], cwd: string): string {
  const executable = process.env.npm_execpath
  if (!executable?.toLowerCase().includes('pnpm')) throw new Error('Run this test through pnpm')
  const isScript = /\.[cm]?js$/i.test(executable)

  try {
    return execFileSync(isScript ? process.execPath : executable, isScript ? [executable, ...args] : args, {
      cwd,
      encoding: 'utf8',
      timeout: 90000,
      env: { ...process.env, CI: 'true' },
    })
  }
  catch (error) {
    const commandError = error as Error & { stdout?: string | Buffer; stderr?: string | Buffer }
    throw new Error(`pnpm ${args.join(' ')} failed:\n${commandError.stdout ?? ''}${commandError.stderr ?? ''}`, { cause: error })
  }
}

it('packs and installs the plugin in a standalone Vite consumer with working types and production build', async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'svg-sprites-consumer-'))
  const packDirectory = path.join(temporaryRoot, 'pack')
  const consumerDirectory = path.join(temporaryRoot, 'consumer')

  try {
    runPnpm(['run', 'build'], packageRoot)
    await mkdir(packDirectory, { recursive: true })
    runPnpm(['pack', '--pack-destination', packDirectory], packageRoot)
    const archive = (await readdir(packDirectory)).find(name => name.endsWith('.tgz'))
    expect(archive).toBeDefined()

    await cp(path.join(packageRoot, 'test', 'fixtures', 'consumer'), consumerDirectory, { recursive: true })
    const manifestPath = path.join(consumerDirectory, 'package.json')
    const manifest = await readFile(manifestPath, 'utf8')
    await writeFile(manifestPath, manifest.replace('__ARCHIVE__', archive!), 'utf8')
    runPnpm(['install', '--offline', '--no-frozen-lockfile'], consumerDirectory)
    runPnpm(['run', 'build'], consumerDirectory)
    runPnpm(['run', 'typecheck'], consumerDirectory)

    const assetsDirectory = path.join(consumerDirectory, 'dist', 'assets')
    const bundleName = (await readdir(assetsDirectory)).find(name => name.endsWith('.js'))
    expect(bundleName).toBeDefined()
    const bundle = await readFile(path.join(assetsDirectory, bundleName!), 'utf8')
    expect(bundle).toContain('icon-add')
    expect(bundle).toContain('data-svg-sprites')
    expect(await readFile(path.join(consumerDirectory, 'src', 'types', 'svg-icons.d.ts'), 'utf8'))
      .toContain('export type SvgIconName = "add"')
  }
  finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}, 120000)