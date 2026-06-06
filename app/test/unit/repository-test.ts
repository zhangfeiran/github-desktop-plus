import { describe, it } from 'node:test'
import assert from 'node:assert'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { Repository } from '../../src/models/repository'
import { toWslPath } from '../../src/lib/git/source'

describe('Repository', () => {
  describe('name', () => {
    it('uses the last path component as the name', async () => {
      const repoPath = '/some/cool/path'
      const repository = new Repository(repoPath, -1, null, false)
      assert.equal(repository.name, 'path')
    })

    it('handles repository at root of the drive', async () => {
      const repoPath = 'T:\\'
      const repository = new Repository(repoPath, -1, null, false)
      assert.equal(repository.name, 'T:\\')
    })

    it('uses the main worktree name for a linked worktree without GitHub metadata', async () => {
      const tempRoot = await mkdtemp(
        path.join(os.tmpdir(), 'github-desktop-plus-repository-name-')
      )
      try {
        const mainRepoPath = path.join(tempRoot, 'repo')
        const linkedRepoPath = path.join(tempRoot, 'repo-feature-worktree')
        const worktreeGitDir = path.join(
          mainRepoPath,
          '.git',
          'worktrees',
          'feature'
        )

        await mkdir(path.join(mainRepoPath, '.git'), { recursive: true })
        await mkdir(worktreeGitDir, { recursive: true })
        await mkdir(linkedRepoPath, { recursive: true })
        await writeFile(
          path.join(linkedRepoPath, '.git'),
          `gitdir: ${toWslPath(worktreeGitDir)}\n`
        )
        await writeFile(path.join(worktreeGitDir, 'commondir'), '../..\n')

        const repository = new Repository(linkedRepoPath, -1, null, false)

        assert.equal(repository.isLinkedWorktree, true)
        assert.equal(repository.mainWorktreePath, mainRepoPath)
        assert.equal(repository.name, 'repo')
      } finally {
        await rm(tempRoot, { recursive: true, force: true })
      }
    })
  })
})
