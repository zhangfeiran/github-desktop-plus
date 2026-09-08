import { FileDiffStats } from '../models/diff'
import { forceUnwrap } from './fatal-error'

/** Parse the two count fields from Git's --numstat output. */
export function parseDiffStats(added: string, deleted: string): FileDiffStats {
  return added === '-' || deleted === '-'
    ? { kind: 'binary' }
    : {
        kind: 'text',
        linesAdded: parseInt(added, 10),
        linesDeleted: parseInt(deleted, 10),
      }
}

/** Parse --numstat -z, preserving literal paths including tabs and newlines. */
export function parseNumstat(
  stdout: string
): ReadonlyMap<string, FileDiffStats> {
  const stats = new Map<string, FileDiffStats>()
  const fields = stdout.split('\0')
  for (let i = 0; i < fields.length - 1; i++) {
    const match = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(fields[i])
    const [, added, deleted, path] = forceUnwrap('Invalid numstat entry', match)
    // Renames/copies put the old and new paths in the next two NUL fields.
    const newPath =
      path.length > 0
        ? path
        : forceUnwrap('Missing numstat destination path', fields[(i += 2)])
    stats.set(newPath, parseDiffStats(added, deleted))
  }
  return stats
}
