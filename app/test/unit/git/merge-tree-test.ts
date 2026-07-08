import { describe, it } from 'node:test'
import assert from 'node:assert'
import { exec } from 'dugite'
import { ComputedAction } from '../../../src/models/computed-action'
import { getMergePreview } from '../../../src/lib/git/merge-tree'
import { setupEmptyRepository } from '../../helpers/repositories'
import {
  createBranch,
  makeCommit,
  switchTo,
} from '../../helpers/repository-scaffolding'
import { Repository } from '../../../src/models/repository'

async function getRef(repository: Repository, ref: string) {
  const result = await exec(['rev-parse', ref], repository.path)
  return result.stdout.trim()
}

describe('git/merge-tree', () => {
  describe('getMergePreview', () => {
    it('counts changed files for clean merges in either direction', async t => {
      const repository = await setupEmptyRepository(t)

      await makeCommit(repository, {
        entries: [{ path: 'base.txt', contents: 'base' }],
        commitMessage: 'base',
      })

      await createBranch(repository, 'feature', 'HEAD')
      await switchTo(repository, 'feature')
      await makeCommit(repository, {
        entries: [{ path: 'feature.txt', contents: 'feature' }],
        commitMessage: 'feature',
      })
      const feature = await getRef(repository, 'HEAD')

      await switchTo(repository, 'master')
      await makeCommit(repository, {
        entries: [{ path: 'main.txt', contents: 'main' }],
        commitMessage: 'main',
      })
      const master = await getRef(repository, 'HEAD')

      const mergeFeatureIntoMaster = await getMergePreview(
        repository,
        master,
        feature
      )
      if (mergeFeatureIntoMaster.kind !== ComputedAction.Clean) {
        throw new Error('Expected merging feature into master to be clean')
      }

      assert.match(mergeFeatureIntoMaster.mergeTree, /^[0-9a-f]{40}$/)
      assert.equal(mergeFeatureIntoMaster.changedFiles, 1)
      assert.equal(mergeFeatureIntoMaster.linesAdded, 1)
      assert.equal(mergeFeatureIntoMaster.linesDeleted, 0)
      assert.equal(mergeFeatureIntoMaster.conflictedFiles, 0)
      assert.deepStrictEqual(mergeFeatureIntoMaster.files, [
        { path: 'feature.txt', status: 'added' },
      ])

      const mergeMasterIntoFeature = await getMergePreview(
        repository,
        feature,
        master
      )
      if (mergeMasterIntoFeature.kind !== ComputedAction.Clean) {
        throw new Error('Expected merging master into feature to be clean')
      }

      assert.match(mergeMasterIntoFeature.mergeTree, /^[0-9a-f]{40}$/)
      assert.equal(mergeMasterIntoFeature.changedFiles, 1)
      assert.equal(mergeMasterIntoFeature.linesAdded, 1)
      assert.equal(mergeMasterIntoFeature.linesDeleted, 0)
      assert.equal(mergeMasterIntoFeature.conflictedFiles, 0)
      assert.deepStrictEqual(mergeMasterIntoFeature.files, [
        { path: 'main.txt', status: 'added' },
      ])
    })

    it('returns conflict and changed-file counts for conflicted merges', async t => {
      const repository = await setupEmptyRepository(t)

      await makeCommit(repository, {
        entries: [{ path: 'conflict.txt', contents: 'base' }],
        commitMessage: 'base',
      })

      await createBranch(repository, 'feature', 'HEAD')
      await switchTo(repository, 'feature')
      await makeCommit(repository, {
        entries: [{ path: 'conflict.txt', contents: 'feature' }],
        commitMessage: 'feature',
      })
      const feature = await getRef(repository, 'HEAD')

      await switchTo(repository, 'master')
      await makeCommit(repository, {
        entries: [{ path: 'conflict.txt', contents: 'master' }],
        commitMessage: 'master',
      })
      const master = await getRef(repository, 'HEAD')

      const preview = await getMergePreview(repository, master, feature)

      if (preview.kind !== ComputedAction.Conflicts) {
        throw new Error('Expected merge preview to report conflicts')
      }

      assert.match(preview.mergeTree, /^[0-9a-f]{40}$/)
      assert.equal(preview.changedFiles, 1)
      assert.ok(preview.linesAdded > 0)
      assert.ok(preview.linesDeleted > 0)
      assert.equal(preview.conflictedFiles, 1)
      assert.deepStrictEqual(preview.files, [
        { path: 'conflict.txt', status: 'conflicted' },
      ])
    })

    it('returns invalid for unrelated histories', async t => {
      const repository = await setupEmptyRepository(t)

      await makeCommit(repository, {
        entries: [{ path: 'master.txt', contents: 'master' }],
        commitMessage: 'master',
      })
      const master = await getRef(repository, 'HEAD')

      await exec(['checkout', '--orphan', 'orphan'], repository.path)
      await makeCommit(repository, {
        entries: [{ path: 'orphan.txt', contents: 'orphan' }],
        commitMessage: 'orphan',
      })
      const orphan = await getRef(repository, 'HEAD')

      const preview = await getMergePreview(repository, master, orphan)

      assert.equal(preview.kind, ComputedAction.Invalid)
    })
  })
})
