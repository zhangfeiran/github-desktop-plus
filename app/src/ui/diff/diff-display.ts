import { AppFileStatus, AppFileStatusKind } from '../../models/status'

/**
 * New and deleted file diffs only contain one meaningful side, so keep their
 * text diff readable even when the saved diff preference is split.
 */
export function getEffectiveShowSideBySideDiff(
  showSideBySideDiff: boolean,
  status: AppFileStatus
): boolean {
  if (!showSideBySideDiff) {
    return false
  }

  return !shouldTemporarilyShowUnifiedDiff(status)
}

export function shouldTemporarilyShowUnifiedDiff(
  status: AppFileStatus
): boolean {
  return (
    status.kind === AppFileStatusKind.New ||
    status.kind === AppFileStatusKind.Untracked ||
    status.kind === AppFileStatusKind.Deleted
  )
}
