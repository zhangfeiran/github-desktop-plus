import { Branch } from '../../models/branch'
import { ComputedAction } from '../../models/computed-action'
import {
  MergePreviewFile,
  MergePreviewFileStatus,
  MergePreviewResult,
  MergeTreeResult,
} from '../../models/merge'
import { Repository } from '../../models/repository'
import { git, isGitError } from './core'
import { GitError } from 'dugite'

function parseMergeTreeOutput(stdout: string) {
  const [tree, ...conflictedFiles] = stdout
    .split('\0')
    .filter(entry => entry.length > 0)

  const mergeTree = tree?.trim()
  if (mergeTree === undefined || mergeTree.length === 0) {
    throw new Error('Unable to parse merge-tree output')
  }

  return { mergeTree, conflictedFiles }
}

function mapMergePreviewFileStatus(
  rawStatus: string,
  isConflicted: boolean
): MergePreviewFileStatus {
  if (isConflicted) {
    return 'conflicted'
  }

  if (rawStatus.startsWith('A')) {
    return 'added'
  }

  if (rawStatus.startsWith('D')) {
    return 'deleted'
  }

  if (rawStatus.startsWith('R')) {
    return 'renamed'
  }

  if (rawStatus.startsWith('C')) {
    return 'copied'
  }

  return 'modified'
}

function parseMergePreviewFiles(
  stdout: string,
  conflictedFiles: ReadonlyArray<string>
): ReadonlyArray<MergePreviewFile> {
  const entries = stdout.split('\0').filter(entry => entry.length > 0)
  const conflicts = new Set(conflictedFiles)
  const files = new Array<MergePreviewFile>()

  for (let i = 0; i < entries.length; i++) {
    const rawStatus = entries[i]

    if (rawStatus === undefined) {
      break
    }

    if (rawStatus.startsWith('R') || rawStatus.startsWith('C')) {
      const oldPath = entries[++i]
      const path = entries[++i]

      if (oldPath === undefined || path === undefined) {
        break
      }

      files.push({
        oldPath,
        path,
        status: mapMergePreviewFileStatus(rawStatus, conflicts.has(path)),
      })
      continue
    }

    const path = entries[++i]

    if (path === undefined) {
      break
    }

    files.push({
      path,
      status: mapMergePreviewFileStatus(rawStatus, conflicts.has(path)),
    })
  }

  return files
}

function parseMergePreviewLineCounts(stdout: string) {
  let linesAdded = 0
  let linesDeleted = 0

  for (const entry of stdout.split('\0')) {
    const match = /^(\d+|-)\t(\d+|-)\t/.exec(entry)

    if (match === null) {
      continue
    }

    const [, added, deleted] = match
    linesAdded += added === '-' ? 0 : parseInt(added, 10)
    linesDeleted += deleted === '-' ? 0 : parseInt(deleted, 10)
  }

  return { linesAdded, linesDeleted }
}

/**
 * Preview merging `source` into `target` without touching the working tree.
 *
 * The changed file count is the diff between the target commit and Git's
 * virtual merge tree, so it represents what the target branch would see after
 * accepting the merge.
 */
export async function getMergePreview(
  repository: Repository,
  target: string,
  source: string
): Promise<MergePreviewResult> {
  return git(
    [
      'merge-tree',
      '--write-tree',
      '--name-only',
      '--no-messages',
      '-z',
      target,
      source,
    ],
    repository.path,
    'getMergePreview',
    { successExitCodes: new Set([0, 1]) }
  )
    .then<MergePreviewResult>(async ({ stdout }) => {
      const { mergeTree, conflictedFiles } = parseMergeTreeOutput(stdout)
      const [diff, numstat] = await Promise.all([
        git(
          ['diff', '-M', '-C', '--name-status', '-z', target, mergeTree],
          repository.path,
          'getMergePreviewChangedFiles'
        ),
        git(
          ['diff', '-M', '-C', '--numstat', '-z', target, mergeTree],
          repository.path,
          'getMergePreviewLineCounts'
        ),
      ])
      const files = parseMergePreviewFiles(diff.stdout, conflictedFiles)
      const changedFiles = files.length
      const { linesAdded, linesDeleted } = parseMergePreviewLineCounts(
        numstat.stdout
      )

      return conflictedFiles.length > 0
        ? {
            kind: ComputedAction.Conflicts,
            mergeTree,
            conflictedFiles: conflictedFiles.length,
            changedFiles,
            linesAdded,
            linesDeleted,
            files,
          }
        : {
            kind: ComputedAction.Clean,
            mergeTree,
            conflictedFiles: 0,
            changedFiles,
            linesAdded,
            linesDeleted,
            files,
          }
    })
    .catch<MergePreviewResult>(e =>
      isGitError(e, GitError.CannotMergeUnrelatedHistories)
        ? Promise.resolve({ kind: ComputedAction.Invalid })
        : Promise.reject(e)
    )
}

export async function determineMergeability(
  repository: Repository,
  ours: Branch,
  theirs: Branch
): Promise<MergeTreeResult> {
  const preview = await getMergePreview(
    repository,
    ours.tip.sha,
    theirs.tip.sha
  )

  if (preview.kind === ComputedAction.Conflicts) {
    return {
      kind: ComputedAction.Conflicts,
      conflictedFiles: preview.conflictedFiles,
    }
  }

  if (preview.kind === ComputedAction.Invalid) {
    return { kind: ComputedAction.Invalid }
  }

  return { kind: ComputedAction.Clean }
}
