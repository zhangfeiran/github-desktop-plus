import { Repository } from '../../models/repository'
import { FileDiffStats } from '../../models/diff'
import {
  AppFileStatusKind,
  WorkingDirectoryFileChange,
  WorkingDirectoryFileChangeDiffType,
} from '../../models/status'
import { parseNumstat } from '../numstat'
import { parallelWithConcurrencyLimit } from '../promise'
import { git } from './core'
import { getWorkingDirectoryDiffArguments } from './diff'

const emptyTextStats: FileDiffStats = {
  kind: 'text',
  linesAdded: 0,
  linesDeleted: 0,
}

function needsIndividualDiff(file: WorkingDirectoryFileChange) {
  return (
    file.isUntracked() ||
    (file.isNew() &&
      file.diffType === WorkingDirectoryFileChangeDiffType.Unstaged) ||
    file.status.kind === AppFileStatusKind.Renamed ||
    file.status.kind === AppFileStatusKind.Copied
  )
}

/**
 * Load file statistics without loading patches or changing the real index.
 * Ordinary tracked changes are batched; new files use Git's binary detection.
 * Results are keyed by file ID so staged and unstaged rows remain distinct.
 */
export async function getWorkingDirectoryDiffStats(
  repository: Repository,
  files: ReadonlyArray<WorkingDirectoryFileChange>,
  isCancelled: () => boolean = () => false
): Promise<ReadonlyMap<string, FileDiffStats>> {
  const result = new Map<string, FileDiffStats>()
  const candidates = files.filter(f => f.status.submoduleStatus === undefined)
  const individual = candidates.filter(needsIndividualDiff)
  const conflicted = candidates.filter(
    f => f.status.kind === AppFileStatusKind.Conflicted
  )
  const tracked = candidates.filter(
    f =>
      !needsIndividualDiff(f) && f.status.kind !== AppFileStatusKind.Conflicted
  )

  const loadBatch = async (
    batch: ReadonlyArray<WorkingDirectoryFileChange>,
    args: ReadonlyArray<string>
  ) => {
    if (batch.length === 0 || isCancelled()) {
      return
    }
    try {
      const { stdout } = await git(
        ['diff', '--no-ext-diff', '--numstat', '-z', ...args, '--'],
        repository.path,
        'getWorkingDirectoryDiffStats'
      )
      const statsByPath = parseNumstat(stdout)
      for (const file of batch) {
        // Git can omit files whose only change is metadata or stat information.
        result.set(file.id, statsByPath.get(file.path) ?? emptyTextStats)
      }
    } catch (error) {
      // Counts are optional; a refresh must still display the files and diff.
      log.warn('Unable to load working directory diff statistics', error)
    }
  }

  await Promise.all([
    ...[
      WorkingDirectoryFileChangeDiffType.Staged,
      WorkingDirectoryFileChangeDiffType.Unstaged,
    ].map(side => {
      const batch = tracked.filter(f => f.diffType === side)
      const args =
        side === WorkingDirectoryFileChangeDiffType.Staged ? ['--staged'] : []
      return loadBatch(batch, ['--no-renames', ...args])
    }),
    // Match the conflict viewer's comparison of HEAD with conflict markers.
    loadBatch(conflicted, ['--no-renames', 'HEAD']),
    parallelWithConcurrencyLimit(
      individual,
      async file => {
        if (isCancelled()) {
          return
        }
        try {
          const args = getWorkingDirectoryDiffArguments(file)
          const { stdout, exitCode } = await git(
            ['diff', '--no-ext-diff', '--numstat', '-z', ...args],
            repository.path,
            'getFileDiffStats',
            {
              successExitCodes: new Set(
                args.includes('--no-index') ? [0, 1] : [0]
              ),
            }
          )
          const stats = parseNumstat(stdout).values().next().value
          if (stats !== undefined) {
            result.set(file.id, stats)
          } else if (exitCode === 0) {
            // An empty file has no diff. Exit code 1 with no output can also
            // mean the file vanished, and must not be reported as zero lines.
            result.set(file.id, emptyTextStats)
          }
        } catch (error) {
          // The file may have disappeared since status was loaded.
          log.warn(`Unable to load diff statistics for ${file.path}`, error)
        }
      },
      4
    ),
  ])

  return result
}
