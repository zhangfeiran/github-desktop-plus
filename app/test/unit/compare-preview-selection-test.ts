import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BranchPreviewKind,
  ComparisonMode,
  HistoryTabMode,
  IMergePreviewSelection,
} from '../../src/lib/app-state'
import { AppStore } from '../../src/lib/stores/app-store'
import { RepositoryStateCache } from '../../src/lib/stores/repository-state-cache'
import { Branch, BranchType } from '../../src/models/branch'
import { ComputedAction } from '../../src/models/computed-action'
import { Repository } from '../../src/models/repository'
import { TipState } from '../../src/models/tip'
import { TestStatsStore } from '../helpers/test-stats-store'

function branch(name: string, sha: string) {
  return new Branch(
    name,
    null,
    { sha, author: { date: new Date(0) } },
    BranchType.Local,
    `refs/heads/${name}`,
    false
  )
}

function setup(
  kind = BranchPreviewKind.Merge,
  comparisonMode = ComparisonMode.Behind
) {
  const repository = new Repository('/compare-preview', 1, null, false)
  const statsStore = new TestStatsStore()
  const cache = new RepositoryStateCache(statsStore)
  const currentBranch = branch('my-dev', 'current-tip')
  const comparisonBranch = branch('main', 'comparison-tip')
  const tip = { kind: TipState.Valid, branch: currentBranch } as const
  const action = {
    kind: HistoryTabMode.Compare,
    branch: comparisonBranch,
    comparisonMode,
  } as const
  const target =
    comparisonMode === ComparisonMode.Behind ? currentBranch : comparisonBranch
  const source =
    comparisonMode === ComparisonMode.Behind ? comparisonBranch : currentBranch
  const preview: IMergePreviewSelection = {
    kind,
    comparisonMode,
    targetBranchName: target.name,
    sourceBranchName: source.name,
    targetSHA: target.tip.sha,
    sourceSHA: source.tip.sha,
  }
  cache.updateBranchesState(repository, () => ({ tip }))
  cache.updateCompareState(repository, () => ({
    tip: currentBranch.tip.sha,
    formState: {
      kind: HistoryTabMode.Compare,
      comparisonBranch,
      comparisonMode,
      aheadBehind: { ahead: 1, behind: 1 },
    },
  }))
  cache.updateCommitSelection(repository, () => ({ mergePreview: preview }))

  let fileLoads = 0
  const gitStore = {
    tip,
    loadCommitBatch: async () => ['history-commit'],
    loadLocalCommits: async () => [],
    getCompareCommits: async () => ({
      commits: [{ sha: 'comparison-commit' }],
      ahead: 1,
      behind: 1,
    }),
  }
  // Exercise the real selection and comparison methods with in-memory state,
  // without constructing the application's IPC and background services.
  const store = Object.create(AppStore.prototype) as AppStore
  Object.assign(store, {
    repositoryStateCache: cache,
    gitStoreCache: { get: () => gitStore },
    statsStore,
    emitUpdate: () => {},
    _loadNextCommitBatch: async () => {},
    setupMergabilityPromise: async () => ({ kind: ComputedAction.Clean }),
    _loadChangedFilesForCurrentSelection: async () => {
      fileLoads++
    },
  })
  return {
    store,
    cache,
    repository,
    action,
    preview,
    gitStore,
    selection: () => cache.get(repository).commitSelection,
    fileLoads: () => fileLoads,
  }
}

describe('Compare preview selection during refresh', () => {
  for (const kind of [BranchPreviewKind.Merge, BranchPreviewKind.Diff]) {
    for (const mode of [ComparisonMode.Behind, ComparisonMode.Ahead] as const) {
      it(`preserves the ${kind} preview on ${mode} during repeated comparison initialization`, async () => {
        const t = setup(kind, mode)
        const selection = t.selection()

        for (let i = 0; i < 2; i++) {
          await t.store._executeCompare(t.repository, t.action, true)
          assert.equal(t.selection(), selection)
        }
        assert.equal(t.fileLoads(), 0)
      })

      it(`preserves the ${kind} preview on ${mode} when history has no selection candidates`, async () => {
        const t = setup(kind, mode)
        const selection = t.selection()
        await t.store['refreshHistorySection'](t.repository)
        assert.equal(t.selection(), selection)
        assert.equal(t.fileLoads(), 0)
      })
    }
  }

  it('preserves a preview selected while a comparison refresh is in flight', async () => {
    const t = setup()
    t.store._changeCommitSelection(t.repository, ['comparison-commit'], true)
    let finish!: (value: {
      commits: { sha: string }[]
      ahead: number
      behind: number
    }) => void
    t.gitStore.getCompareCommits = () =>
      new Promise(resolve => {
        finish = resolve
      })
    const refresh = t.store._executeCompare(t.repository, t.action)
    await t.store._changeMergePreviewSelection(t.repository, t.preview)
    const selection = t.selection()
    finish({ commits: [{ sha: 'comparison-commit' }], ahead: 1, behind: 1 })
    await refresh
    assert.equal(t.selection(), selection)
  })

  it('selects a commit when switching comparison direction', async () => {
    const t = setup()
    await t.store._executeCompare(t.repository, {
      ...t.action,
      comparisonMode: ComparisonMode.Ahead,
    })
    assert.equal(t.selection().mergePreview, null)
    assert.deepEqual(t.selection().shas, ['comparison-commit'])
  })

  for (const comparisonBranch of [
    branch('other', 'comparison-tip'),
    branch('main', 'updated-tip'),
  ]) {
    it(`clears a preview when the compared branch changes to ${comparisonBranch.name} at ${comparisonBranch.tip.sha}`, async () => {
      const t = setup()
      await t.store._executeCompare(t.repository, {
        ...t.action,
        branch: comparisonBranch,
      })
      assert.equal(t.selection().mergePreview, null)
      assert.deepEqual(t.selection().shas, ['comparison-commit'])
    })
  }

  it('clears a preview when the current tip changes', () => {
    const t = setup()
    t.cache.updateBranchesState(t.repository, () => ({
      tip: { kind: TipState.Valid, branch: branch('my-dev', 'updated-tip') },
    }))
    t.store['updateOrSelectFirstCommit'](t.repository, ['history-commit'])
    assert.equal(t.selection().mergePreview, null)
    assert.deepEqual(t.selection().shas, ['history-commit'])
  })

  it('clears a preview when returning to history', async () => {
    const t = setup()
    await t.store._executeCompare(t.repository, {
      kind: HistoryTabMode.History,
    })
    assert.equal(t.selection().mergePreview, null)
    assert.deepEqual(t.selection().shas, ['history-commit'])
  })

  for (const kind of [BranchPreviewKind.Merge, BranchPreviewKind.Diff]) {
    it(`handles an empty comparison while the ${kind} preview is selected`, async () => {
      const t = setup(kind)
      t.gitStore.getCompareCommits = async () => ({
        commits: [],
        ahead: 0,
        behind: 0,
      })
      await t.store._executeCompare(t.repository, t.action)
      assert.equal(
        t.selection().mergePreview,
        kind === BranchPreviewKind.Diff ? t.preview : null
      )
      assert.deepEqual(t.selection().shas, [])
    })
  }

  it('still selects the first commit when no preview or commit is selected', async () => {
    const t = setup()
    t.cache.updateCommitSelection(t.repository, () => ({ mergePreview: null }))
    await t.store._executeCompare(t.repository, t.action)
    assert.deepEqual(t.selection().shas, ['comparison-commit'])
    assert.equal(t.fileLoads(), 1)
  })
})
