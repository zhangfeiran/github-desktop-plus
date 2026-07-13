import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { WorktreeEntry } from '../../../src/models/worktree'
import { WorktreeListItem } from '../../../src/ui/worktrees/worktree-list-item'
import { fireEvent, render, screen, within } from '../../helpers/ui/render'
import { IMatches } from '../../../src/lib/fuzzy-find'
import {
  advanceTimersBy,
  enableTestTimers,
  resetTestTimers,
} from '../../helpers/ui/timers'

const noMatches: IMatches = { title: [], subtitle: [] }

const worktree: WorktreeEntry = {
  path: 'C:\\repos\\desktop-linked',
  head: '0123456789abcdef0123456789abcdef01234567',
  branch: 'refs/heads/feature/worktree-hover',
  isDetached: false,
  type: 'linked',
  isLocked: true,
  isPrunable: false,
}

describe('WorktreeListItem', () => {
  beforeEach(() => {
    enableTestTimers(['setTimeout'])
  })

  afterEach(() => {
    resetTestTimers()
  })

  it('shows branch, path, last modified time, HEAD, and state on hover', () => {
    const view = render(
      <WorktreeListItem
        worktree={worktree}
        isCurrentWorktree={false}
        matches={noMatches}
        lastModified={new Date('2026-07-10T08:30:00.000Z')}
      />
    )

    const row = view.container.querySelector('.worktrees-list-item')

    assert.notEqual(row, null)
    if (row === null) {
      throw new Error('Expected worktree row to be rendered')
    }

    fireEvent.mouseEnter(row, { clientX: 20, clientY: 20 })
    fireEvent.mouseMove(row, { clientX: 20, clientY: 20 })
    advanceTimersBy(400)

    const tooltip = within(screen.getByRole('tooltip', { hidden: true }))

    assert.ok(tooltip.getByText('feature/worktree-hover'))
    assert.ok(tooltip.getByText(worktree.path))
    assert.ok(tooltip.getByText(worktree.head))
    assert.ok(tooltip.getByText('Locked'))
    assert.ok(tooltip.getByText(/2026/))
  })
})
