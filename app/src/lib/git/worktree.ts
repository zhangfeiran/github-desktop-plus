import * as Path from 'path'
import * as Fs from 'fs'
import type { Repository } from '../../models/repository'
import type { WorktreeEntry, WorktreeType } from '../../models/worktree'
import { git } from './core'
import { normalizePath } from '../helpers/path'
import {
  fromWslPath,
  isWslRepositoryPath,
  translateWslPathValue,
} from './source'

function getDotGitPath(repositoryPath: string): string {
  return Path.join(repositoryPath, '.git')
}

function resolveGitPath(basePath: string, path: string): string {
  const translatedPath =
    process.platform === 'win32' ? translateWslPathValue(path) ?? path : path

  return Path.resolve(basePath, translatedPath)
}

export interface IWorktreePathInfo {
  readonly isLinkedWorktree: boolean
  readonly mainWorktreePath: string | null
}

export function translateWorktreePathForRepository(
  repository: Repository,
  worktreePath: string
): string {
  const translatedPath = translateWslPathValue(worktreePath)
  if (translatedPath !== worktreePath) {
    return translatedPath ?? worktreePath
  }

  if (
    process.platform === 'win32' &&
    isWslRepositoryPath(repository.path) &&
    worktreePath.startsWith('\\') &&
    !worktreePath.startsWith('\\\\')
  ) {
    return fromWslPath(worktreePath.replace(/\\/g, '/'))
  }

  return worktreePath
}

export function parseWorktreePorcelainOutput(
  stdout: string
): ReadonlyArray<WorktreeEntry> {
  if (stdout.trim().length === 0) {
    return []
  }

  // With -z, worktree blocks are separated by double NUL and fields within
  // a block are separated by single NUL
  const blocks = stdout.replace(/\0$/, '').split('\0\0')
  const entries: WorktreeEntry[] = []

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].split('\0')
    let path = ''
    let head = ''
    let branch: string | null = null
    let isDetached = false
    let isLocked = false
    let isPrunable = false

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        // Git for Windows will output paths using forward slashes, i.e.
        // c:/Users/niik/... but repositories added in Desktop always pass
        // through getRepositoryType which uses path.resolve to deduce the
        // absolute top level directory and that will normalize paths as well
        // so by normalizing here we can be more confident about comparing paths
        path = Path.normalize(line.substring('worktree '.length))
      } else if (line.startsWith('HEAD ')) {
        head = line.substring('HEAD '.length)
      } else if (line.startsWith('branch ')) {
        branch = line.substring('branch '.length)
      } else if (line === 'detached') {
        isDetached = true
      } else if (line === 'locked' || line.startsWith('locked ')) {
        isLocked = true
      } else if (line === 'prunable' || line.startsWith('prunable ')) {
        isPrunable = true
      }
    }

    const type: WorktreeType = i === 0 ? 'main' : 'linked'
    entries.push({ path, head, branch, isDetached, type, isLocked, isPrunable })
  }

  return entries
}

export async function listWorktrees(
  repository: Repository
): Promise<ReadonlyArray<WorktreeEntry>> {
  const result = await git(
    ['worktree', 'list', '--porcelain', '-z'],
    repository.path,
    'listWorktrees'
  )

  return parseWorktreePorcelainOutput(result.stdout).map(worktree => ({
    ...worktree,
    path: translateWorktreePathForRepository(repository, worktree.path),
  }))
}

export function findWorktreeEntryForBranchRef(
  worktrees: ReadonlyArray<WorktreeEntry>,
  branchRef: string,
  currentPath: string
): WorktreeEntry | null {
  const normalizedCurrentPath = normalizePath(currentPath)

  return (
    worktrees.find(
      worktree =>
        worktree.branch === branchRef &&
        !worktree.isPrunable &&
        normalizePath(worktree.path) !== normalizedCurrentPath
    ) ?? null
  )
}

export async function addWorktree(
  repository: Repository,
  path: string,
  options: {
    /** Branch name used with -b (create new branch) */
    readonly createBranch?: string
    /** Commit-ish to check out (branch name, ref, or SHA) */
    readonly commitish?: string
  } = {}
): Promise<void> {
  const args = ['worktree', 'add']

  if (options.createBranch) {
    args.push('-b', options.createBranch)
  }

  args.push(path)

  if (options.commitish) {
    args.push(options.commitish)
  }

  await git(args, repository.path, 'addWorktree')
}

export async function removeWorktree(
  repositoryPath: string,
  worktreePath: string,
  force: boolean = false
): Promise<void> {
  const args = ['worktree', 'remove']
  if (force) {
    args.push('--force')
  }
  args.push(worktreePath)

  await git(args, repositoryPath, 'removeWorktree')
}

export async function moveWorktree(
  repository: Repository,
  oldPath: string,
  newPath: string
): Promise<void> {
  await git(
    ['worktree', 'move', oldPath, newPath],
    repository.path,
    'moveWorktree'
  )
}

export function getWorktreePathInfoSync(
  repositoryPath: string
): IWorktreePathInfo | null {
  try {
    const dotGit = getDotGitPath(repositoryPath)
    // eslint-disable-next-line no-sync
    const stats = Fs.statSync(dotGit)

    if (stats.isDirectory()) {
      return { isLinkedWorktree: false, mainWorktreePath: repositoryPath }
    }

    if (!stats.isFile()) {
      return null
    }

    // eslint-disable-next-line no-sync
    const contents = Fs.readFileSync(dotGit, 'utf8').trim()
    if (!contents.startsWith('gitdir: ')) {
      return null
    }

    const gitDirPath = resolveGitPath(
      repositoryPath,
      contents.substring('gitdir: '.length)
    )

    // eslint-disable-next-line no-sync
    const commondir = Fs.readFileSync(
      Path.join(gitDirPath, 'commondir'),
      'utf8'
    ).trim()
    if (commondir.length === 0) {
      return null
    }

    const commonGitDir = resolveGitPath(gitDirPath, commondir)
    return {
      isLinkedWorktree: true,
      mainWorktreePath: Path.dirname(commonGitDir),
    }
  } catch {
    return null
  }
}
