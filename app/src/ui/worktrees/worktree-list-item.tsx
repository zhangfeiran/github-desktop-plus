import * as React from 'react'
import * as Path from 'path'
import { WorktreeEntry } from '../../models/worktree'
import { shortenSHA } from '../../models/commit'
import { IMatches } from '../../lib/fuzzy-find'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { HighlightText } from '../lib/highlight-text'
import classNames from 'classnames'
import { TooltippedContent } from '../lib/tooltipped-content'
import { formatDate } from '../../lib/format-date'

interface IWorktreeListItemProps {
  readonly worktree: WorktreeEntry
  readonly isCurrentWorktree: boolean
  readonly matches: IMatches
  readonly lastModified: Date | null
}

export function renderWorktreeTooltip(
  worktree: WorktreeEntry,
  lastModified: Date | null
): JSX.Element {
  const branchName = worktree.branch
    ? worktree.branch.replace(/^refs\/heads\//, '')
    : 'Detached HEAD'
  const worktreeType = worktree.type === 'main' ? 'Main' : 'Linked'
  const states = []

  if (worktree.isLocked) {
    states.push('Locked')
  }
  if (worktree.isPrunable) {
    states.push('Prunable')
  }

  return (
    <div className="worktree-list-item-tooltip list-item-tooltip">
      <div>
        <div className="label">Branch: </div>
        <div className="value">{branchName}</div>
      </div>
      <div>
        <div className="label">Path: </div>
        <div className="value">{worktree.path}</div>
      </div>
      {lastModified !== null && (
        <div>
          <div className="label">Last Modified: </div>
          <div className="value">
            {formatDate(lastModified, {
              dateStyle: 'full',
              timeStyle: 'short',
            })}
          </div>
        </div>
      )}
      <div>
        <div className="label">HEAD: </div>
        <div className="value">{worktree.head}</div>
      </div>
      <div>
        <div className="label">Type: </div>
        <div className="value">{worktreeType}</div>
      </div>
      {states.length > 0 && (
        <div>
          <div className="label">State: </div>
          <div className="value">{states.join(', ')}</div>
        </div>
      )}
    </div>
  )
}

export class WorktreeListItem extends React.Component<IWorktreeListItemProps> {
  public render() {
    const { worktree, isCurrentWorktree, matches, lastModified } = this.props
    const name = Path.basename(worktree.path)
    const icon = isCurrentWorktree ? octicons.check : octicons.fileDirectory
    const className = classNames('worktrees-list-item', {
      'current-worktree': isCurrentWorktree,
    })

    return (
      <TooltippedContent
        className={className}
        tooltip={renderWorktreeTooltip(worktree, lastModified)}
        tagName="div"
      >
        <Octicon className="icon" symbol={icon} />
        <div className="name">
          <HighlightText text={name} highlight={matches.title} />
        </div>
        <div className="description">
          {worktree.branch
            ? worktree.branch.replace(/^refs\/heads\//, '')
            : shortenSHA(worktree.head)}
        </div>
      </TooltippedContent>
    )
  }
}
