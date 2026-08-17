import * as Path from 'path'
import type { Repository } from '../../models/repository'
import type { WorktreeEntry, WorktreeType } from '../../models/worktree'
import { pathExists } from '../path-exists'
import { git } from './core'
import { directoryExists } from '../directory-exists'
import { readFile } from 'fs/promises'
import {
  fromWslPath,
  isSshFsGitSource,
  isWslRepositoryPath,
  toSshFsLocalPath,
  toRemotePosixPath,
  translateWslPathValue,
} from './source'

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

  if (
    process.platform === 'win32' &&
    repository.gitSourceOverride.kind === 'ssh' &&
    worktreePath.startsWith('\\') &&
    !worktreePath.startsWith('\\\\')
  ) {
    const remotePath = toRemotePosixPath(worktreePath)
    return isSshFsGitSource(repository.gitSourceOverride)
      ? toSshFsLocalPath(remotePath, repository.gitSourceOverride)
      : remotePath
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
  repositoryOrPath: Repository | string
): Promise<ReadonlyArray<WorktreeEntry>> {
  const repositoryPath =
    typeof repositoryOrPath === 'string'
      ? repositoryOrPath
      : repositoryOrPath.path
  const result = await git(
    ['worktree', 'list', '--porcelain', '-z'],
    repositoryPath,
    'listWorktrees'
  )

  return parseWorktreePorcelainOutput(result.stdout).map(worktree => ({
    ...worktree,
    path:
      typeof repositoryOrPath === 'string'
        ? worktree.path
        : translateWorktreePathForRepository(repositoryOrPath, worktree.path),
  }))
}

export async function listWorktreesFromGitDir(
  gitDir: string
): Promise<ReadonlyArray<WorktreeEntry>> {
  const result = await git(
    ['--git-dir', gitDir, 'worktree', 'list', '--porcelain', '-z'],
    gitDir,
    'listWorktreesFromGitDir'
  )

  return parseWorktreePorcelainOutput(result.stdout)
}

/**
 * Resolve the path to the main worktree of the repository the given repository
 * belongs to, or null if it is already the main worktree or cannot be resolved.
 *
 * Prefers the path recorded when Desktop switched onto the worktree, falling
 * back to the worktree's administrative git dir for repositories recorded
 * before that path was persisted. The fallback only works while that metadata
 * exists — `git worktree remove` and `git worktree prune` both delete it.
 */
export async function listWorktreesFromGitDirFallback(
  gitDir: string
): Promise<ReadonlyArray<WorktreeEntry>> {
  const commonDir = await resolveCommonGitDir(gitDir)
  const mainWorktreePath = Path.dirname(commonDir)

  if (!(await directoryExists(mainWorktreePath))) {
    return []
  }

  try {
    return await listWorktrees(mainWorktreePath)
  } catch {
    return []
  }
}

/**
 * Resolve the main worktree path, preferring the persisted path and falling
 * back to Git metadata for repositories recorded before persistence existed.
 */
export async function resolveMainWorktreePath(
  repository: Repository
): Promise<string | null> {
  const { mainWorktreePath, gitDir, path } = repository

  if (mainWorktreePath !== undefined && mainWorktreePath === path) {
    return null
  }

  // A recorded path can outlive the location it names, so treat it as a hint
  // rather than the answer — otherwise a stale one would suppress the lookup
  // below, which may well still work.
  if (mainWorktreePath !== undefined && (await pathExists(mainWorktreePath))) {
    return mainWorktreePath
  }

  if (gitDir === undefined) {
    return null
  }

  const worktrees = await listWorktreesFromGitDir(gitDir).catch(() =>
    listWorktreesFromGitDirFallback(gitDir)
  )
  const mainWorktree = worktrees.find(wt => wt.type === 'main')

  if (mainWorktree === undefined) {
    return null
  }

  const translatedPath = translateWorktreePathForRepository(
    repository,
    mainWorktree.path
  )

  return translatedPath === path ? null : translatedPath
}

async function resolveCommonGitDir(gitDir: string): Promise<string> {
  if (Path.basename(Path.dirname(gitDir)) !== 'worktrees') {
    return gitDir
  }

  // Prefer the `commondir` file, but fall back to the conventional layout when
  // git worktree remove has deleted the linked worktree's admin files.
  const conventionalCommonDir = Path.dirname(Path.dirname(gitDir))
  try {
    const fileContent = await readFile(Path.join(gitDir, 'commondir'), 'utf8')
    const commonDir = fileContent.replace(/\r?\n$/, '')
    return commonDir ? Path.resolve(gitDir, commonDir) : conventionalCommonDir
  } catch {
    return conventionalCommonDir
  }
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
