import * as React from 'react'
import { FileDiffStats as Stats } from '../../models/diff'
import { TooltippedContent } from '../lib/tooltipped-content'

export function getDiffStatsLabel(stats: Stats | undefined): string {
  if (stats === undefined) {
    return ''
  }
  return stats.kind === 'binary'
    ? 'Binary file'
    : `${stats.linesAdded} added lines, ${stats.linesDeleted} removed lines`
}

/** Reserve space before PathLabel calculates its truncated path. */
export function getDiffStatsWidth(stats: Stats | undefined): number {
  if (stats === undefined) {
    return 0
  }
  return stats.kind === 'binary'
    ? 48
    : Math.max(
        64,
        (String(stats.linesAdded).length +
          String(stats.linesDeleted).length +
          2) *
          8 +
          5
      )
}

export function FileDiffStats({
  stats,
  inFileList = false,
}: {
  readonly stats?: Stats
  readonly inFileList?: boolean
}) {
  if (stats === undefined) {
    return null
  }

  const label = getDiffStatsLabel(stats)
  return (
    <TooltippedContent className="file-diff-stats-container" tooltip={label}>
      <span
        className="file-diff-stats"
        style={inFileList ? { width: getDiffStatsWidth(stats) } : undefined}
        role="img"
        aria-label={label}
      >
        {stats.kind === 'binary' ? (
          'Binary'
        ) : (
          <>
            <span className="lines-added">+{stats.linesAdded}</span>
            <span className="lines-deleted">−{stats.linesDeleted}</span>
          </>
        )}
      </span>
    </TooltippedContent>
  )
}
