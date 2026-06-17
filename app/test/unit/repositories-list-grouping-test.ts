import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as os from 'node:os'
import * as path from 'node:path'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { groupRepositories } from '../../src/ui/repositories-list/group-repositories'
import { Repository, ILocalRepositoryState } from '../../src/models/repository'
import { CloningRepository } from '../../src/models/cloning-repository'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'
import { WorktreeEntry } from '../../src/models/worktree'
import { toWslPath } from '../../src/lib/git/source'

describe('repository list grouping', () => {
  const repositories: Array<Repository | CloningRepository> = [
    new Repository('repo1', 1, null, false),
    new Repository(
      'repo2',
      2,
      gitHubRepoFixture({ owner: 'me', name: 'my-repo2' }),
      false
    ),
    new Repository(
      'repo3',
      3,
      gitHubRepoFixture({
        owner: '',
        name: 'my-repo3',
        endpoint: 'https://github.big-corp.com/api/v3',
      }),
      false
    ),
  ]

  const cache = new Map<number, ILocalRepositoryState>()

  it('groups repositories by owners/Enterprise/Other', () => {
    const grouped = groupRepositories(repositories, cache, [])
    assert.equal(grouped.length, 3)

    assert.equal(grouped[0].identifier.kind, 'dotcom')
    assert.equal((grouped[0].identifier as any).owner.login, 'me')
    assert.equal(grouped[0].items.length, 1)

    let item = grouped[0].items[0]
    assert.equal(item.repository.path, 'repo2')

    assert.equal(grouped[1].identifier.kind, 'enterprise')
    assert.equal(grouped[1].items.length, 1)

    item = grouped[1].items[0]
    assert.equal(item.repository.path, 'repo3')

    assert.equal(grouped[2].identifier.kind, 'other')
    assert.equal(grouped[2].items.length, 1)

    item = grouped[2].items[0]
    assert.equal(item.repository.path, 'repo1')
  })

  it('sorts repositories alphabetically within each group', () => {
    const repoA = new Repository('a', 1, null, false)
    const repoB = new Repository(
      'b',
      2,
      gitHubRepoFixture({ owner: 'me', name: 'b' }),
      false
    )
    const repoC = new Repository('c', 2, null, false)
    const repoD = new Repository(
      'd',
      2,
      gitHubRepoFixture({ owner: 'me', name: 'd' }),
      false
    )
    const repoZ = new Repository('z', 3, null, false)

    const grouped = groupRepositories(
      [repoC, repoB, repoZ, repoD, repoA],
      cache,
      []
    )
    assert.equal(grouped.length, 2)

    assert.equal(grouped[0].identifier.kind, 'dotcom')
    assert.equal((grouped[0].identifier as any).owner.login, 'me')
    assert.equal(grouped[0].items.length, 2)

    let items = grouped[0].items
    assert.equal(items[0].repository.path, 'b')
    assert.equal(items[1].repository.path, 'd')

    assert.equal(grouped[1].identifier.kind, 'other')
    assert.equal(grouped[1].items.length, 3)

    items = grouped[1].items
    assert.equal(items[0].repository.path, 'a')
    assert.equal(items[1].repository.path, 'c')
    assert.equal(items[2].repository.path, 'z')
  })

  it('only disambiguates Enterprise repositories', () => {
    const repoA = new Repository(
      'repo',
      1,
      gitHubRepoFixture({ owner: 'user1', name: 'repo' }),
      false
    )
    const repoB = new Repository(
      'repo',
      2,
      gitHubRepoFixture({ owner: 'user2', name: 'repo' }),
      false
    )
    const repoC = new Repository(
      'enterprise-repo',
      3,
      gitHubRepoFixture({
        owner: 'business',
        name: 'enterprise-repo',
        endpoint: 'https://ghe.io/api/v3',
      }),
      false
    )
    const repoD = new Repository(
      'enterprise-repo',
      3,
      gitHubRepoFixture({
        owner: 'silliness',
        name: 'enterprise-repo',
        endpoint: 'https://ghe.io/api/v3',
      }),
      false
    )

    const grouped = groupRepositories([repoA, repoB, repoC, repoD], cache, [])
    assert.equal(grouped.length, 3)

    assert.equal(grouped[0].identifier.kind, 'dotcom')
    assert.equal((grouped[0].identifier as any).owner.login, 'user1')
    assert.equal(grouped[0].items.length, 1)

    assert.equal(grouped[1].identifier.kind, 'dotcom')
    assert.equal((grouped[1].identifier as any).owner.login, 'user2')
    assert.equal(grouped[1].items.length, 1)

    assert.equal(grouped[2].identifier.kind, 'enterprise')
    assert.equal(grouped[2].items.length, 2)

    assert.equal(grouped[0].items[0].text[0], 'repo')
    assert(!grouped[0].items[0].needsDisambiguation)

    assert.equal(grouped[1].items[0].text[0], 'repo')
    assert(!grouped[1].items[0].needsDisambiguation)

    assert.equal(grouped[2].items[0].text[0], 'enterprise-repo')
    assert(grouped[2].items[0].needsDisambiguation)

    assert.equal(grouped[2].items[1].text[0], 'enterprise-repo')
    assert(grouped[2].items[1].needsDisambiguation)
  })

  it('nests linked worktrees under their main repository in non-recent groups', async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), 'github-desktop-plus-worktree-grouping-')
    )
    try {
      const mainRepoPath = path.join(tempRoot, 'repo')
      const linkedRepoPath = path.join(tempRoot, 'repo-feature-worktree')

      await mkdir(path.join(mainRepoPath, '.git'), { recursive: true })
      await mkdir(path.join(mainRepoPath, '.git', 'worktrees', 'fix-node'), {
        recursive: true,
      })
      await mkdir(linkedRepoPath, { recursive: true })
      await writeFile(
        path.join(linkedRepoPath, '.git'),
        'gitdir: ../repo/.git/worktrees/fix-node\n'
      )
      await writeFile(
        path.join(mainRepoPath, '.git', 'worktrees', 'fix-node', 'commondir'),
        '../..\n'
      )

      const mainRepo = new Repository(
        mainRepoPath,
        1,
        gitHubRepoFixture({ owner: 'example', name: 'repo' }),
        false
      )
      const linkedRepo = new Repository(
        linkedRepoPath,
        2,
        gitHubRepoFixture({ owner: 'example', name: 'repo' }),
        false
      )

      const grouped = groupRepositories([linkedRepo, mainRepo], cache, [], {
        showWorktreesInSidebar: true,
      })

      assert.equal(grouped.length, 1)
      assert.equal(grouped[0].items.length, 2)
      assert.equal(grouped[0].items[0].repository.path, mainRepoPath)
      assert.equal(grouped[0].items[0].isNestedWorktree, false)
      assert.equal(grouped[0].items[1].repository.path, linkedRepoPath)
      assert.equal(grouped[0].items[1].isNestedWorktree, true)
      assert.equal(grouped[0].items[1].mainWorktreeName, 'repo')
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('hides stored linked worktrees when worktree rows are disabled', async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), 'github-desktop-plus-worktree-hidden-')
    )
    try {
      const mainRepoPath = path.join(tempRoot, 'repo')
      const linkedRepoPath = path.join(tempRoot, 'repo-feature-worktree')

      await mkdir(path.join(mainRepoPath, '.git'), { recursive: true })
      await mkdir(path.join(mainRepoPath, '.git', 'worktrees', 'fix-node'), {
        recursive: true,
      })
      await mkdir(linkedRepoPath, { recursive: true })
      await writeFile(
        path.join(linkedRepoPath, '.git'),
        'gitdir: ../repo/.git/worktrees/fix-node\n'
      )
      await writeFile(
        path.join(mainRepoPath, '.git', 'worktrees', 'fix-node', 'commondir'),
        '../..\n'
      )

      const mainRepo = new Repository(
        mainRepoPath,
        50,
        gitHubRepoFixture({ owner: 'example', name: 'repo' }),
        false
      )
      const linkedRepo = new Repository(
        linkedRepoPath,
        51,
        gitHubRepoFixture({ owner: 'example', name: 'repo' }),
        false
      )

      const grouped = groupRepositories([linkedRepo, mainRepo], cache, [])

      assert.equal(grouped.length, 1)
      assert.equal(grouped[0].items.length, 1)
      assert.equal(grouped[0].items[0].repository.path, mainRepoPath)
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('uses the selected linked worktree as the hidden worktree representative', async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), 'github-desktop-plus-worktree-hidden-selected-')
    )
    try {
      const mainRepoPath = path.join(tempRoot, 'repo')
      const linkedRepoPath = path.join(tempRoot, 'repo-feature-worktree')

      await mkdir(path.join(mainRepoPath, '.git'), { recursive: true })
      await mkdir(path.join(mainRepoPath, '.git', 'worktrees', 'fix-node'), {
        recursive: true,
      })
      await mkdir(linkedRepoPath, { recursive: true })
      await writeFile(
        path.join(linkedRepoPath, '.git'),
        'gitdir: ../repo/.git/worktrees/fix-node\n'
      )
      await writeFile(
        path.join(mainRepoPath, '.git', 'worktrees', 'fix-node', 'commondir'),
        '../..\n'
      )

      const mainRepo = new Repository(
        mainRepoPath,
        53,
        gitHubRepoFixture({ owner: 'example', name: 'repo' }),
        false
      )
      const linkedRepo = new Repository(
        linkedRepoPath,
        54,
        gitHubRepoFixture({ owner: 'example', name: 'repo' }),
        false
      )

      const grouped = groupRepositories([linkedRepo, mainRepo], cache, [], {
        selectedRepository: linkedRepo,
      })

      assert.equal(grouped.length, 1)
      assert.equal(grouped[0].items.length, 1)
      assert.equal(grouped[0].items[0].repository.path, linkedRepoPath)
      assert.equal(grouped[0].items[0].title, 'repo')
      assert.equal(grouped[0].items[0].isNestedWorktree, false)
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('uses the most recent linked worktree as the hidden representative after switching away', async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), 'github-desktop-plus-worktree-hidden-recent-')
    )
    try {
      const mainRepoPath = path.join(tempRoot, 'repo')
      const linkedRepoPath = path.join(tempRoot, 'repo-feature-worktree')

      await mkdir(path.join(mainRepoPath, '.git'), { recursive: true })
      await mkdir(path.join(mainRepoPath, '.git', 'worktrees', 'fix-node'), {
        recursive: true,
      })
      await mkdir(linkedRepoPath, { recursive: true })
      await writeFile(
        path.join(linkedRepoPath, '.git'),
        'gitdir: ../repo/.git/worktrees/fix-node\n'
      )
      await writeFile(
        path.join(mainRepoPath, '.git', 'worktrees', 'fix-node', 'commondir'),
        '../..\n'
      )

      const mainRepo = new Repository(
        mainRepoPath,
        56,
        gitHubRepoFixture({ owner: 'example', name: 'repo' }),
        false
      )
      const linkedRepo = new Repository(
        linkedRepoPath,
        57,
        gitHubRepoFixture({ owner: 'example', name: 'repo' }),
        false
      )
      const otherRepo = new Repository(
        path.join(tempRoot, 'other'),
        58,
        gitHubRepoFixture({ owner: 'example', name: 'other' }),
        false
      )

      const grouped = groupRepositories(
        [linkedRepo, mainRepo, otherRepo],
        cache,
        [linkedRepo.id],
        { selectedRepository: otherRepo }
      )
      const item = grouped
        .flatMap(group => group.items)
        .find(item => item.repository.id === linkedRepo.id)

      assert.notEqual(item, undefined)
      assert.equal(item?.repository.path, linkedRepoPath)
      assert.equal(item?.title, 'repo')
      assert.equal(
        grouped
          .flatMap(group => group.items)
          .some(item => item.repository.id === mainRepo.id),
        false
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('keeps a linked repository row bound to the linked worktree when rows are disabled', async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), 'github-desktop-plus-worktree-hidden-current-')
    )
    try {
      const mainRepoPath = path.join(tempRoot, 'repo')
      const linkedRepoPath = path.join(tempRoot, 'repo-feature-worktree')
      const worktrees: ReadonlyArray<WorktreeEntry> = [
        {
          path: mainRepoPath,
          head: 'abc123',
          branch: 'refs/heads/main',
          isDetached: false,
          type: 'main',
          isLocked: false,
          isPrunable: false,
        },
        {
          path: linkedRepoPath,
          head: 'def456',
          branch: 'refs/heads/fix-node',
          isDetached: false,
          type: 'linked',
          isLocked: false,
          isPrunable: false,
        },
      ]

      await mkdir(path.join(mainRepoPath, '.git'), { recursive: true })
      await mkdir(path.join(mainRepoPath, '.git', 'worktrees', 'fix-node'), {
        recursive: true,
      })
      await mkdir(linkedRepoPath, { recursive: true })
      await writeFile(
        path.join(linkedRepoPath, '.git'),
        'gitdir: ../repo/.git/worktrees/fix-node\n'
      )
      await writeFile(
        path.join(mainRepoPath, '.git', 'worktrees', 'fix-node', 'commondir'),
        '../..\n'
      )

      const linkedRepo = new Repository(
        linkedRepoPath,
        55,
        gitHubRepoFixture({ owner: 'example', name: 'repo' }),
        false
      )
      const localState = new Map<number, ILocalRepositoryState>([
        [
          linkedRepo.id,
          {
            aheadBehind: null,
            changedFilesCount: 0,
            branchName: 'fix-node',
            defaultBranchName: 'main',
            worktrees,
          },
        ],
      ])

      const grouped = groupRepositories([linkedRepo], localState, [])

      assert.equal(grouped.length, 1)
      assert.equal(grouped[0].items.length, 1)
      assert.equal(grouped[0].items[0].repository.path, linkedRepoPath)
      assert.equal(grouped[0].items[0].worktree?.path, linkedRepoPath)
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('keeps orphan linked worktrees visible when worktree rows are disabled', async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), 'github-desktop-plus-worktree-orphan-visible-')
    )
    try {
      const mainRepoPath = path.join(tempRoot, 'repo')
      const linkedRepoPath = path.join(tempRoot, 'repo-feature-worktree')

      await mkdir(path.join(mainRepoPath, '.git'), { recursive: true })
      await mkdir(path.join(mainRepoPath, '.git', 'worktrees', 'fix-node'), {
        recursive: true,
      })
      await mkdir(linkedRepoPath, { recursive: true })
      await writeFile(
        path.join(linkedRepoPath, '.git'),
        'gitdir: ../repo/.git/worktrees/fix-node\n'
      )
      await writeFile(
        path.join(mainRepoPath, '.git', 'worktrees', 'fix-node', 'commondir'),
        '../..\n'
      )

      const linkedRepo = new Repository(
        linkedRepoPath,
        52,
        gitHubRepoFixture({ owner: 'example', name: 'repo' }),
        false
      )

      const grouped = groupRepositories([linkedRepo], cache, [])

      assert.equal(grouped.length, 1)
      assert.equal(grouped[0].items.length, 1)
      assert.equal(grouped[0].items[0].repository.path, linkedRepoPath)
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('nests linked worktrees that use WSL absolute gitdir paths', async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), 'github-desktop-plus-wsl-worktree-grouping-')
    )
    try {
      const mainRepoPath = path.join(tempRoot, 'repo')
      const linkedRepoPath = path.join(tempRoot, 'repo-feature-worktree')
      const worktreeGitDir = path.join(
        mainRepoPath,
        '.git',
        'worktrees',
        'fix-node'
      )

      await mkdir(path.join(mainRepoPath, '.git'), { recursive: true })
      await mkdir(worktreeGitDir, { recursive: true })
      await mkdir(linkedRepoPath, { recursive: true })
      await writeFile(
        path.join(linkedRepoPath, '.git'),
        `gitdir: ${toWslPath(worktreeGitDir)}\n`
      )
      await writeFile(path.join(worktreeGitDir, 'commondir'), '../..\n')

      const mainRepo = new Repository(
        mainRepoPath,
        30,
        gitHubRepoFixture({ owner: 'example', name: 'repo' }),
        false
      )
      const linkedRepo = new Repository(
        linkedRepoPath,
        31,
        gitHubRepoFixture({ owner: 'example', name: 'repo' }),
        false
      )

      const grouped = groupRepositories([linkedRepo, mainRepo], cache, [], {
        showWorktreesInSidebar: true,
      })

      assert.equal(grouped.length, 1)
      assert.equal(grouped[0].items.length, 2)
      assert.equal(grouped[0].items[0].repository.path, mainRepoPath)
      assert.equal(grouped[0].items[1].repository.path, linkedRepoPath)
      assert.equal(grouped[0].items[1].isNestedWorktree, true)
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('nests stored linked worktrees using their parent repository group', async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), 'github-desktop-plus-worktree-parent-group-')
    )
    try {
      const mainRepoPath = path.join(tempRoot, 'repo')
      const linkedRepoPath = path.join(tempRoot, 'repo-feature-worktree')

      await mkdir(path.join(mainRepoPath, '.git'), { recursive: true })
      await mkdir(path.join(mainRepoPath, '.git', 'worktrees', 'fix-node'), {
        recursive: true,
      })
      await mkdir(linkedRepoPath, { recursive: true })
      await writeFile(
        path.join(linkedRepoPath, '.git'),
        'gitdir: ../repo/.git/worktrees/fix-node\n'
      )
      await writeFile(
        path.join(mainRepoPath, '.git', 'worktrees', 'fix-node', 'commondir'),
        '../..\n'
      )

      const mainRepo = new Repository(
        mainRepoPath,
        40,
        gitHubRepoFixture({ owner: 'example', name: 'repo' }),
        false
      )
      const linkedRepoWithoutGitHubMetadata = new Repository(
        linkedRepoPath,
        41,
        null,
        false
      )

      const grouped = groupRepositories(
        [linkedRepoWithoutGitHubMetadata, mainRepo],
        cache,
        [],
        {
          showWorktreesInSidebar: true,
        }
      )

      assert.equal(grouped.length, 1)
      assert.equal(grouped[0].identifier.kind, 'dotcom')
      assert.equal(grouped[0].items.length, 2)
      assert.equal(grouped[0].items[0].repository.path, mainRepoPath)
      assert.equal(grouped[0].items[1].repository.path, linkedRepoPath)
      assert.equal(grouped[0].items[1].isNestedWorktree, true)
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('shows unstored linked worktrees under their main repository', async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), 'github-desktop-plus-worktree-virtual-')
    )
    try {
      const mainRepoPath = path.join(tempRoot, 'repo')
      const unstoredWorktreePath = path.join(tempRoot, 'repo-feature-a')
      const mainRepo = new Repository(
        mainRepoPath,
        10,
        gitHubRepoFixture({ owner: 'example', name: 'repo' }),
        false
      )

      const worktrees: ReadonlyArray<WorktreeEntry> = [
        {
          path: mainRepoPath,
          head: 'a',
          branch: 'refs/heads/main',
          isDetached: false,
          type: 'main',
          isLocked: false,
          isPrunable: false,
        },
        {
          path: unstoredWorktreePath,
          head: 'b',
          branch: 'refs/heads/feature/a',
          isDetached: false,
          type: 'linked',
          isLocked: false,
          isPrunable: false,
        },
      ]

      cache.set(mainRepo.id, {
        aheadBehind: null,
        changedFilesCount: 0,
        branchName: 'main',
        defaultBranchName: 'main',
        worktrees,
      })

      const grouped = groupRepositories([mainRepo], cache, [], {
        showWorktreesInSidebar: true,
      })

      assert.equal(grouped.length, 1)
      assert.equal(grouped[0].items.length, 2)
      assert.equal(grouped[0].items[0].repository.path, mainRepoPath)
      assert.equal(grouped[0].items[1].worktreePath, unstoredWorktreePath)
      assert.equal(grouped[0].items[1].isVirtualLinkedWorktree, true)
      assert.equal(grouped[0].items[1].text[0], 'repo-feature-a')
      assert.equal(grouped[0].items[1].branchName, 'feature/a')
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('marks prunable linked worktrees in the sidebar item model', () => {
    const mainRepo = new Repository(
      '/tmp/repo',
      1,
      gitHubRepoFixture({ owner: 'example', name: 'repo' }),
      false
    )

    const cache = new Map<number, ILocalRepositoryState>()
    cache.set(mainRepo.id, {
      changedFilesCount: 0,
      aheadBehind: null,
      branchName: 'main',
      defaultBranchName: 'main',
      worktrees: [
        {
          path: '/tmp/repo',
          head: 'abc',
          branch: 'refs/heads/main',
          isDetached: false,
          type: 'main',
          isLocked: false,
          isPrunable: false,
        },
        {
          path: '/tmp/repo-stale',
          head: 'def',
          branch: 'refs/heads/feature/stale',
          isDetached: false,
          type: 'linked',
          isLocked: false,
          isPrunable: true,
        },
      ],
    })

    const grouped = groupRepositories([mainRepo], cache, [], {
      showWorktreesInSidebar: true,
    })

    assert.equal(grouped.length, 1)
    assert.equal(grouped[0].items.length, 2)
    assert.equal(grouped[0].items[1].isPrunableWorktree, true)
  })

  it('uses parent preloaded worktree data for stored linked worktree branch names', async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), 'github-desktop-plus-worktree-branch-fallback-')
    )
    try {
      const mainRepoPath = path.join(tempRoot, 'repo')
      const linkedRepoPath = path.join(tempRoot, 'repo-feature-a')

      await mkdir(path.join(mainRepoPath, '.git'), { recursive: true })
      await mkdir(path.join(mainRepoPath, '.git', 'worktrees', 'feature-a'), {
        recursive: true,
      })
      await mkdir(linkedRepoPath, { recursive: true })
      await writeFile(
        path.join(linkedRepoPath, '.git'),
        'gitdir: ../repo/.git/worktrees/feature-a\n'
      )
      await writeFile(
        path.join(mainRepoPath, '.git', 'worktrees', 'feature-a', 'commondir'),
        '../..\n'
      )

      const mainRepo = new Repository(
        mainRepoPath,
        12,
        gitHubRepoFixture({ owner: 'example', name: 'repo' }),
        false
      )
      const linkedRepo = new Repository(
        linkedRepoPath,
        13,
        gitHubRepoFixture({ owner: 'example', name: 'repo' }),
        false
      )

      const worktrees: ReadonlyArray<WorktreeEntry> = [
        {
          path: mainRepoPath,
          head: 'a',
          branch: 'refs/heads/main',
          isDetached: false,
          type: 'main',
          isLocked: false,
          isPrunable: false,
        },
        {
          path: linkedRepoPath,
          head: 'b',
          branch: 'refs/heads/feature/a',
          isDetached: false,
          type: 'linked',
          isLocked: false,
          isPrunable: false,
        },
      ]

      cache.set(mainRepo.id, {
        aheadBehind: null,
        changedFilesCount: 0,
        branchName: 'main',
        defaultBranchName: 'main',
        worktrees,
      })

      const grouped = groupRepositories([linkedRepo, mainRepo], cache, [], {
        showWorktreesInSidebar: true,
      })

      assert.equal(grouped.length, 1)
      assert.equal(grouped[0].items.length, 2)
      assert.equal(grouped[0].items[1].repository.path, linkedRepoPath)
      assert.equal(grouped[0].items[1].isNestedWorktree, true)
      assert.equal(grouped[0].items[1].branchName, 'feature/a')
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not synthesize linked worktree siblings under orphan linked worktrees', async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), 'github-desktop-plus-worktree-orphan-leaf-')
    )
    try {
      const mainRepoPath = path.join(tempRoot, 'repo')
      const linkedRepoPath = path.join(tempRoot, 'repo-feature-a')
      const secondLinkedRepoPath = path.join(tempRoot, 'repo-feature-b')

      await mkdir(path.join(mainRepoPath, '.git'), { recursive: true })
      await mkdir(path.join(mainRepoPath, '.git', 'worktrees', 'feature-a'), {
        recursive: true,
      })
      await mkdir(path.join(mainRepoPath, '.git', 'worktrees', 'feature-b'), {
        recursive: true,
      })
      await mkdir(linkedRepoPath, { recursive: true })
      await writeFile(
        path.join(linkedRepoPath, '.git'),
        'gitdir: ../repo/.git/worktrees/feature-a\n'
      )
      await writeFile(
        path.join(mainRepoPath, '.git', 'worktrees', 'feature-a', 'commondir'),
        '../..\n'
      )
      await writeFile(
        path.join(mainRepoPath, '.git', 'worktrees', 'feature-b', 'commondir'),
        '../..\n'
      )

      const linkedRepo = new Repository(
        linkedRepoPath,
        20,
        gitHubRepoFixture({ owner: 'example', name: 'repo' }),
        false,
        'custom alias'
      )

      cache.set(linkedRepo.id, {
        aheadBehind: null,
        changedFilesCount: 0,
        branchName: 'feature/a',
        defaultBranchName: 'main',
        worktrees: [
          {
            path: mainRepoPath,
            head: 'a',
            branch: 'refs/heads/main',
            isDetached: false,
            type: 'main',
            isLocked: false,
            isPrunable: false,
          },
          {
            path: linkedRepoPath,
            head: 'b',
            branch: 'refs/heads/feature/a',
            isDetached: false,
            type: 'linked',
            isLocked: false,
            isPrunable: false,
          },
          {
            path: secondLinkedRepoPath,
            head: 'c',
            branch: 'refs/heads/feature/b',
            isDetached: false,
            type: 'linked',
            isLocked: false,
            isPrunable: false,
          },
        ],
      })

      const grouped = groupRepositories([linkedRepo], cache, [], {
        showWorktreesInSidebar: true,
      })

      assert.equal(grouped.length, 1)
      assert.equal(grouped[0].items.length, 1)
      assert.equal(grouped[0].items[0].repository.path, linkedRepoPath)
      assert.equal(grouped[0].items[0].isNestedWorktree, false)
      assert.equal(grouped[0].items[0].title, 'custom alias')
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })
})
