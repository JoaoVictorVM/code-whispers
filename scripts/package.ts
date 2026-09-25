import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync, type Zippable } from 'fflate'

export const ZIP_PREFIX = 'code-whispers'

export class MissingBuildError extends Error {}

export function zipFileName(version: string): string {
  return `${ZIP_PREFIX}-${version}.zip`
}

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? listFiles(path) : [path]
  })
}

export function buildArchive(distDir: string): Uint8Array {
  if (!existsSync(join(distDir, 'index.html'))) {
    throw new MissingBuildError(
      `Build não encontrado em ${distDir}. Rode "bun run build" antes de "bun run package".`,
    )
  }
  const entries: Zippable = {}
  for (const file of listFiles(distDir)) {
    entries[relative(distDir, file).split(sep).join('/')] = readFileSync(file)
  }
  return zipSync(entries, { level: 9 })
}

export function readVersion(rootDir: string): string {
  const manifest = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')) as { version?: unknown }
  if (typeof manifest.version !== 'string' || manifest.version === '') {
    throw new Error('package.json sem o campo "version".')
  }
  return manifest.version
}

export function packageDist(rootDir: string): { outputPath: string; bytes: number } {
  const archive = buildArchive(join(rootDir, 'dist'))
  const outputPath = join(rootDir, zipFileName(readVersion(rootDir)))
  writeFileSync(outputPath, archive)
  return { outputPath, bytes: archive.byteLength }
}

export function runCli(rootDir: string): number {
  try {
    const { outputPath, bytes } = packageDist(rootDir)
    console.log(`Pacote criado: ${outputPath} (${(bytes / 1024).toFixed(1)} KB)`)
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }
}

const scriptPath = fileURLToPath(import.meta.url)

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  process.exitCode = runCli(resolve(scriptPath, '..', '..'))
}
