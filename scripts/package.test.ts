import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MissingBuildError, buildArchive, packageDist, runCli, zipFileName } from './package'

let root: string

function writeFile(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

function fakeProject(version = '1.2.0', withDist = true): void {
  writeFile(join(root, 'package.json'), JSON.stringify({ name: 'code-whispers', version }))
  if (!withDist) return
  writeFile(join(root, 'dist', 'index.html'), '<!doctype html><script src="./assets/app.js"></script>')
  writeFile(join(root, 'dist', 'assets', 'app.js'), 'console.log(1)')
  writeFile(join(root, 'dist', 'avatars', 'avatar-01.png'), 'png')
}

describe('package script', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cw-package-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('test_output_filename_uses_package_version', () => {
    expect(zipFileName('1.2.0')).toBe('code-whispers-1.2.0.zip')
    fakeProject('1.2.0')
    const { outputPath } = packageDist(root)
    expect(outputPath).toBe(join(root, 'code-whispers-1.2.0.zip'))
  })

  it('test_missing_dist_fails_with_clear_message', () => {
    fakeProject('1.2.0', false)
    expect(() => buildArchive(join(root, 'dist'))).toThrow(MissingBuildError)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(runCli(root)).toBe(1)
    expect(error.mock.calls[0][0]).toContain('bun run build')
  })

  it('test_zip_entries_have_no_dist_prefix', () => {
    fakeProject()
    const { outputPath } = packageDist(root)
    const entries = unzipSync(new Uint8Array(readFileSync(outputPath)))
    expect(Object.keys(entries).sort()).toEqual(['assets/app.js', 'avatars/avatar-01.png', 'index.html'])
    expect(new TextDecoder().decode(entries['assets/app.js'])).toBe('console.log(1)')
  })

  it('reports the created file on success', () => {
    fakeProject('0.3.1')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(runCli(root)).toBe(0)
    expect(log.mock.calls[0][0]).toContain('code-whispers-0.3.1.zip')
  })

  it('fails when package.json has no version', () => {
    writeFile(join(root, 'package.json'), JSON.stringify({ name: 'code-whispers' }))
    writeFile(join(root, 'dist', 'index.html'), '<html></html>')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(runCli(root)).toBe(1)
  })
})
