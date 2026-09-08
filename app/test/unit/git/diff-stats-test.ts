import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFile, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { exec } from 'dugite'
import { getWorkingDirectoryDiffStats } from '../../../src/lib/git/diff-stats'
import {
  getWorkingDirectoryDiff,
  getBranchDiffChangedFiles,
} from '../../../src/lib/git/diff'
import { DiffType, DiffLineType } from '../../../src/models/diff'
import { AppFileStatusKind } from '../../../src/models/status'
import {
  setupEmptyRepository,
  setupConflictedRepoWithMultipleFiles,
  setupFixtureRepository,
} from '../../helpers/repositories'
import { Repository } from '../../../src/models/repository'
import { getStatusOrThrow } from '../../helpers/status'
import { makeCommit } from '../../helpers/repository-scaffolding'

describe('file diff statistics', () => {
  it('counts staged and unstaged changes independently and preserves the index', async t => {
    const repository = await setupEmptyRepository(t)
    await makeCommit(repository, {
      entries: [{ path: 'file.txt', contents: 'original\n' }],
      commitMessage: 'base',
    })
    await writeFile(join(repository.path, 'file.txt'), 'staged\n')
    await exec(['add', 'file.txt'], repository.path)
    await writeFile(
      join(repository.path, 'file.txt'),
      'staged\nfirst\nsecond\n'
    )
    const {
      workingDirectory: { files },
    } = await getStatusOrThrow(repository)
    const indexBefore = await readFile(join(repository.path, '.git', 'index'))
    const stats = await getWorkingDirectoryDiffStats(repository, files)
    const staged = files.find(f => f.isStaged)!
    const unstaged = files.find(f => !f.isStaged)!
    assert.deepStrictEqual(stats.get(staged.id), {
      kind: 'text',
      linesAdded: 1,
      linesDeleted: 1,
    })
    assert.deepStrictEqual(stats.get(unstaged.id), {
      kind: 'text',
      linesAdded: 2,
      linesDeleted: 0,
    })
    assert.deepStrictEqual(
      await readFile(join(repository.path, '.git', 'index')),
      indexBefore
    )

    const fileWithStats = staged.withDiffStats(stats.get(staged.id)!)
    assert.deepStrictEqual(
      fileWithStats.withIncludeAll(false).diffStats,
      fileWithStats.diffStats
    )
    assert.equal(fileWithStats.id, staged.id)

    await writeFile(join(repository.path, 'file.txt'), 'staged\nfirst\n')
    const refreshed = await getWorkingDirectoryDiffStats(repository, files)
    assert.deepStrictEqual(refreshed.get(unstaged.id), {
      kind: 'text',
      linesAdded: 1,
      linesDeleted: 0,
    })
  })

  it('counts untracked text, empty files, and binaries without creating an index', async t => {
    const repository = await setupEmptyRepository(t)
    await writeFile(join(repository.path, 'empty.txt'), '')
    await writeFile(join(repository.path, '新文件.txt'), 'one\ntwo')
    await writeFile(join(repository.path, 'image.bin'), Buffer.from([1, 0, 2]))
    await writeFile(join(repository.path, '.gitattributes'), '*.dat -diff\n')
    await writeFile(
      join(repository.path, 'data.dat'),
      'text marked as binary\n'
    )
    const {
      workingDirectory: { files },
    } = await getStatusOrThrow(repository)
    const stats = await getWorkingDirectoryDiffStats(repository, files)
    const forPath = (path: string) =>
      stats.get(files.find(f => f.path === path)!.id)
    assert.deepStrictEqual(forPath('empty.txt'), {
      kind: 'text',
      linesAdded: 0,
      linesDeleted: 0,
    })
    assert.deepStrictEqual(forPath('新文件.txt'), {
      kind: 'text',
      linesAdded: 2,
      linesDeleted: 0,
    })
    assert.deepStrictEqual(forPath('image.bin'), { kind: 'binary' })
    assert.deepStrictEqual(forPath('data.dat'), { kind: 'binary' })
    await assert.rejects(readFile(join(repository.path, '.git', 'index')), {
      code: 'ENOENT',
    })
  })

  it('handles staged additions before the first commit and skips obsolete loads', async t => {
    const repository = await setupEmptyRepository(t)
    await writeFile(join(repository.path, 'new.txt'), 'one\ntwo\n')
    await exec(['add', 'new.txt'], repository.path)
    const {
      workingDirectory: { files },
    } = await getStatusOrThrow(repository)
    const stats = await getWorkingDirectoryDiffStats(repository, files)
    assert.deepStrictEqual(stats.get(files[0].id), {
      kind: 'text',
      linesAdded: 2,
      linesDeleted: 0,
    })
    assert.equal(
      (await getWorkingDirectoryDiffStats(repository, files, () => true)).size,
      0
    )
  })

  it('distinguishes pure renames from unstaged edits and counts deletions', async t => {
    const repository = await setupEmptyRepository(t)
    await makeCommit(repository, {
      entries: [
        { path: 'old.txt', contents: 'one\ntwo\n' },
        { path: 'delete.txt', contents: 'delete\nme\n' },
      ],
      commitMessage: 'base',
    })
    await exec(['mv', 'old.txt', 'new.txt'], repository.path)
    await writeFile(join(repository.path, 'new.txt'), 'one\ntwo\nthree\n')
    await unlink(join(repository.path, 'delete.txt'))
    const {
      workingDirectory: { files },
    } = await getStatusOrThrow(repository)
    const stats = await getWorkingDirectoryDiffStats(repository, files)
    const renamed = files.find(
      f => f.status.kind === AppFileStatusKind.Renamed
    )!
    assert.deepStrictEqual(stats.get(renamed.id), {
      kind: 'text',
      linesAdded: 0,
      linesDeleted: 0,
    })
    const diff = await getWorkingDirectoryDiff(repository, renamed)
    assert(diff.kind === DiffType.Text)
    assert.equal(diff.hunks.length, 0)
    assert.deepStrictEqual(
      stats.get(files.find(f => f.path === 'new.txt' && !f.isStaged)!.id),
      { kind: 'text', linesAdded: 1, linesDeleted: 0 }
    )
    assert.deepStrictEqual(
      stats.get(files.find(f => f.path === 'delete.txt')!.id),
      { kind: 'text', linesAdded: 0, linesDeleted: 2 }
    )
  })

  it('counts conflict markers against the same base as the diff viewer', async t => {
    const repository = await setupConflictedRepoWithMultipleFiles(t)
    const {
      workingDirectory: { files },
    } = await getStatusOrThrow(repository)
    const stats = await getWorkingDirectoryDiffStats(repository, files)
    const file = files.find(f => f.path === 'foo')!
    const diff = await getWorkingDirectoryDiff(repository, file)
    assert(diff.kind === DiffType.Text)
    const lines = diff.hunks.flatMap(h => h.lines)
    assert.deepStrictEqual(stats.get(file.id), {
      kind: 'text',
      linesAdded: lines.filter(l => l.type === DiffLineType.Add).length,
      linesDeleted: lines.filter(l => l.type === DiffLineType.Delete).length,
    })
  })

  it('matches the destination diff for a copy whose source was also modified', async t => {
    const repoPath = await setupFixtureRepository(t, 'copy-detection-status')
    const repository = new Repository(repoPath, -1, null, false)
    await exec(['config', 'status.renames', 'copies'], repoPath)
    await exec(['add', '.'], repoPath)
    const {
      workingDirectory: { files },
    } = await getStatusOrThrow(repository)
    const copied = files.find(f => f.status.kind === AppFileStatusKind.Copied)!
    assert(copied !== undefined)
    const stats = await getWorkingDirectoryDiffStats(repository, files)
    const diff = await getWorkingDirectoryDiff(repository, copied)
    assert(diff.kind === DiffType.Text)
    const lines = diff.hunks.flatMap(h => h.lines)
    assert.deepStrictEqual(stats.get(copied.id), {
      kind: 'text',
      linesAdded: lines.filter(l => l.type === DiffLineType.Add).length,
      linesDeleted: lines.filter(l => l.type === DiffLineType.Delete).length,
    })
  })

  it('keeps a vanished untracked file unavailable instead of assigning zero', async t => {
    const repository = await setupEmptyRepository(t)
    await writeFile(join(repository.path, 'gone.txt'), 'one\n')
    const {
      workingDirectory: { files },
    } = await getStatusOrThrow(repository)
    await unlink(join(repository.path, 'gone.txt'))
    assert.equal(
      (await getWorkingDirectoryDiffStats(repository, files)).has(files[0].id),
      false
    )
  })

  it('reverses per-file counts with the Compare direction', async t => {
    const repository = await setupEmptyRepository(t)
    await makeCommit(repository, {
      entries: [{ path: 'file.txt', contents: 'one\n' }],
      commitMessage: 'base',
    })
    await makeCommit(repository, {
      entries: [{ path: 'file.txt', contents: 'two\nthree\n' }],
      commitMessage: 'change',
    })
    const forward = await getBranchDiffChangedFiles(repository, 'HEAD^', 'HEAD')
    const reverse = await getBranchDiffChangedFiles(repository, 'HEAD', 'HEAD^')
    assert.deepStrictEqual(forward.files[0].diffStats, {
      kind: 'text',
      linesAdded: 2,
      linesDeleted: 1,
    })
    assert.deepStrictEqual(reverse.files[0].diffStats, {
      kind: 'text',
      linesAdded: 1,
      linesDeleted: 2,
    })
  })
})
