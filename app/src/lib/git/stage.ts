import { Repository } from '../../models/repository'
import {
  WorkingDirectoryFileChange,
  isConflictedFileStatus,
  GitStatusEntry,
  isConflictWithMarkers,
  AppFileStatusKind,
} from '../../models/status'
import { ManualConflictResolution } from '../../models/manual-conflict-resolution'
import { assertNever } from '../fatal-error'
import { removeConflictedFile } from './rm'
import { checkoutConflictedFile } from './checkout'
import { addConflictedFile } from './add'
import { stageFiles } from './update-index'
import { GitResetMode, resetPaths } from './reset'
import { git } from './core'

function getPathsToUnstage(
  files: ReadonlyArray<WorkingDirectoryFileChange>
): ReadonlyArray<string> {
  const paths = new Set<string>()

  for (const file of files) {
    paths.add(file.path)

    if (file.status.kind === AppFileStatusKind.Renamed) {
      paths.add(file.status.oldPath)
    }
  }

  return Array.from(paths)
}

/** Stage the selected working-directory files into Git's index. */
export async function stageWorkingDirectoryFiles(
  repository: Repository,
  files: ReadonlyArray<WorkingDirectoryFileChange>
): Promise<void> {
  await stageFiles(repository, files)
}

/** Remove the selected files from Git's index while preserving the worktree. */
export async function unstageWorkingDirectoryFiles(
  repository: Repository,
  files: ReadonlyArray<WorkingDirectoryFileChange>
): Promise<void> {
  const paths = getPathsToUnstage(files)
  if (paths.length === 0) {
    return
  }

  const { exitCode } = await git(
    ['rev-parse', '--verify', 'HEAD'],
    repository.path,
    'hasHeadForUnstage',
    { successExitCodes: new Set([0, 1, 128]) }
  )

  if (exitCode === 0) {
    await resetPaths(repository, GitResetMode.Mixed, 'HEAD', paths)
  } else {
    await git(
      ['rm', '--cached', '-r', '-f', '--', ...paths],
      repository.path,
      'unstageWorkingDirectoryFiles'
    )
  }
}

/**
 * Stages a file with the given manual resolution method. Useful for resolving binary conflicts at commit-time.
 *
 * @param repository
 * @param file conflicted file to stage
 * @param manualResolution method to resolve the conflict of file
 * @returns true if successful, false if something went wrong
 */
export async function stageManualConflictResolution(
  repository: Repository,
  file: WorkingDirectoryFileChange,
  manualResolution: ManualConflictResolution
): Promise<void> {
  const { status } = file
  // if somehow the file isn't in a conflicted state
  if (!isConflictedFileStatus(status)) {
    log.error(`tried to manually resolve unconflicted file (${file.path})`)
    return
  }

  if (isConflictWithMarkers(status) && status.conflictMarkerCount === 0) {
    // If somehow the user used the Desktop UI to solve the conflict via ours/theirs
    // but afterwards resolved manually the conflicts via an editor, used the manually
    // resolved file.
    return
  }

  const chosen =
    manualResolution === ManualConflictResolution.theirs
      ? status.entry.them
      : status.entry.us

  const addedInBoth =
    status.entry.us === GitStatusEntry.Added &&
    status.entry.them === GitStatusEntry.Added

  if (chosen === GitStatusEntry.UpdatedButUnmerged || addedInBoth) {
    await checkoutConflictedFile(repository, file, manualResolution)
  }

  switch (chosen) {
    case GitStatusEntry.Deleted:
      return removeConflictedFile(repository, file)
    case GitStatusEntry.Added:
    case GitStatusEntry.UpdatedButUnmerged:
      return addConflictedFile(repository, file)
    default:
      assertNever(chosen, 'unaccounted for git status entry possibility')
  }
}

/**
 * Stages all resolved conflict files before a checkout operation to prevent
 * "error: you need to resolve your current index first" from git.
 *
 * Handles two kinds of resolved conflicts:
 *  - Text conflicts resolved in an external editor (conflictMarkerCount === 0)
 *  - Manual conflicts where the user chose ours/theirs in the Desktop UI
 */
export async function stageResolvedConflictFiles(
  repository: Repository,
  files: ReadonlyArray<WorkingDirectoryFileChange>,
  manualResolutions: ReadonlyMap<string, ManualConflictResolution>
): Promise<void> {
  for (const file of files) {
    const { status } = file
    if (!isConflictedFileStatus(status)) {
      continue
    }

    const manualResolution = manualResolutions.get(file.path)

    if (manualResolution !== undefined) {
      // Binary/manual conflict resolved via Desktop UI — stage it
      await stageManualConflictResolution(repository, file, manualResolution)
    } else if (
      isConflictWithMarkers(status) &&
      status.conflictMarkerCount === 0
    ) {
      // Text conflict resolved in external editor — stage it
      await addConflictedFile(repository, file)
    }
  }
}
