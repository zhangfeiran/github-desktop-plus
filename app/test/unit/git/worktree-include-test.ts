import assert from 'node:assert'
import { describe, it } from 'node:test'
import { mkdir, writeFile, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import * as Path from 'path'
import { exec } from 'dugite'

import {
  readWorktreeIncludePatterns,
  getIgnoredFilesMatchingPatterns,
  copyWorktreeIncludeFiles,
} from '../../../src/lib/git/worktree-include'
import { createTempDirectory } from '../../helpers/temp'
import { setupEmptyRepository } from '../../helpers/repositories'

describe('git/worktree-include', () => {
  describe('readWorktreeIncludePatterns', () => {
    it('returns empty array when file does not exist', async t => {
      const dir = await createTempDirectory(t)
      const patterns = await readWorktreeIncludePatterns(dir)
      assert.deepStrictEqual(patterns, [])
    })

    it('parses patterns from file', async t => {
      const dir = await createTempDirectory(t)
      await writeFile(
        Path.join(dir, '.worktreeinclude'),
        '.env\n.env.local\nconfig/secrets.json\n'
      )
      const patterns = await readWorktreeIncludePatterns(dir)
      assert.deepStrictEqual(patterns, [
        '.env',
        '.env.local',
        'config/secrets.json',
      ])
    })

    it('skips blank lines and comments', async t => {
      const dir = await createTempDirectory(t)
      await writeFile(
        Path.join(dir, '.worktreeinclude'),
        '# This is a comment\n\n.env\n\n# Another comment\n.env.local\n'
      )
      const patterns = await readWorktreeIncludePatterns(dir)
      assert.deepStrictEqual(patterns, ['.env', '.env.local'])
    })

    it('returns empty array for a file with only comments and blanks', async t => {
      const dir = await createTempDirectory(t)
      await writeFile(Path.join(dir, '.worktreeinclude'), '# comment\n\n   \n')
      const patterns = await readWorktreeIncludePatterns(dir)
      assert.deepStrictEqual(patterns, [])
    })
  })

  describe('getIgnoredFilesMatchingPatterns', () => {
    it('returns empty array when patterns is empty', async t => {
      const repo = await setupEmptyRepository(t)
      const files = await getIgnoredFilesMatchingPatterns(repo, [])
      assert.deepStrictEqual(files, [])
    })

    it('returns gitignored files matching the patterns', async t => {
      const repo = await setupEmptyRepository(t)

      await exec(['config', 'user.email', 'test@example.com'], repo.path)
      await exec(['config', 'user.name', 'Test User'], repo.path)

      await writeFile(Path.join(repo.path, '.gitignore'), '.env\n')
      await exec(['add', '.gitignore'], repo.path)
      await exec(['commit', '-m', 'add gitignore'], repo.path)

      await writeFile(Path.join(repo.path, '.env'), 'SECRET=value\n')
      await writeFile(Path.join(repo.path, 'readme.txt'), 'hello\n')
      await exec(['add', 'readme.txt'], repo.path)

      const files = await getIgnoredFilesMatchingPatterns(repo, ['.env'])
      assert.deepStrictEqual(files, ['.env'])
    })

    it('does not return tracked files even if pattern matches', async t => {
      const repo = await setupEmptyRepository(t)
      await exec(['config', 'user.email', 'test@example.com'], repo.path)
      await exec(['config', 'user.name', 'Test User'], repo.path)

      await writeFile(Path.join(repo.path, '.gitignore'), '')
      await writeFile(Path.join(repo.path, 'tracked.txt'), 'content\n')
      await exec(['add', 'tracked.txt', '.gitignore'], repo.path)
      await exec(['commit', '-m', 'initial'], repo.path)

      const files = await getIgnoredFilesMatchingPatterns(repo, ['tracked.txt'])
      assert.deepStrictEqual(files, [])
    })

    it('does not return gitignored files that do not match the pattern', async t => {
      const repo = await setupEmptyRepository(t)
      await exec(['config', 'user.email', 'test@example.com'], repo.path)
      await exec(['config', 'user.name', 'Test User'], repo.path)

      await writeFile(
        Path.join(repo.path, '.gitignore'),
        '.env\nsecrets.json\n'
      )
      await exec(['add', '.gitignore'], repo.path)
      await exec(['commit', '-m', 'gitignore'], repo.path)

      await writeFile(Path.join(repo.path, '.env'), 'SECRET=1\n')
      await writeFile(Path.join(repo.path, 'secrets.json'), '{}')

      const files = await getIgnoredFilesMatchingPatterns(repo, ['.env'])
      assert.deepStrictEqual(files, ['.env'])
    })
  })

  describe('copyWorktreeIncludeFiles', () => {
    it('copies files preserving directory structure', async t => {
      const source = await createTempDirectory(t)
      const dest = await createTempDirectory(t)

      await mkdir(Path.join(source, 'config'), { recursive: true })
      await writeFile(Path.join(source, '.env'), 'SECRET=1\n')
      await writeFile(Path.join(source, 'config', 'secrets.json'), '{}')

      await copyWorktreeIncludeFiles(source, dest, [
        '.env',
        'config/secrets.json',
      ])

      const envContent = await readFile(Path.join(dest, '.env'), 'utf8')
      assert.strictEqual(envContent, 'SECRET=1\n')

      const secretsContent = await readFile(
        Path.join(dest, 'config', 'secrets.json'),
        'utf8'
      )
      assert.strictEqual(secretsContent, '{}')
    })

    it('skips files that do not exist at the source', async t => {
      const source = await createTempDirectory(t)
      const dest = await createTempDirectory(t)

      await writeFile(Path.join(source, '.env'), 'SECRET=1\n')

      await copyWorktreeIncludeFiles(source, dest, ['.env', 'missing.txt'])

      assert.ok(existsSync(Path.join(dest, '.env')))
      assert.ok(!existsSync(Path.join(dest, 'missing.txt')))
    })

    it('does not copy files with path traversal patterns', async t => {
      const source = await createTempDirectory(t)
      const dest = await createTempDirectory(t)

      await writeFile(Path.join(source, '.env'), 'SECRET=1\n')

      await copyWorktreeIncludeFiles(source, dest, ['../../../etc/passwd'])

      const destContents = await import('fs/promises').then(fs =>
        fs.readdir(dest)
      )
      assert.strictEqual(destContents.length, 0)
    })
  })
})
