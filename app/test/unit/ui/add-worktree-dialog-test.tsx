import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import * as Path from 'path'
import * as React from 'react'

import { Branch, BranchType } from '../../../src/models/branch'
import { Repository } from '../../../src/models/repository'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { getDefaultDir, setDefaultDir } from '../../../src/ui/lib/default-dir'
import { AddWorktreeDialog } from '../../../src/ui/worktrees/add-worktree-dialog'
import { setupEmptyRepository } from '../../helpers/repositories'
import { createBranch, makeCommit } from '../../helpers/repository-scaffolding'
import { createTempDirectory } from '../../helpers/temp'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

const originalPath = Path.resolve('original-location')
let restoreIpcSend: (() => void) | null = null

async function openDialog(repository: Repository, branchName: string) {
  const onDismissed = mock.fn()
  const postError = mock.fn()
  const switchWorktree = mock.fn(async () => {})
  const dispatcher = {
    postError,
    switchWorktree,
    incrementMetric: () => {},
  } as unknown as Dispatcher
  const view = render(
    <AddWorktreeDialog
      repository={repository}
      dispatcher={dispatcher}
      onDismissed={onDismissed}
      initialBranchName={branchName}
      allBranches={[
        new Branch(
          branchName,
          null,
          { sha: 'HEAD', author: { date: new Date(0) } },
          BranchType.Local,
          `refs/heads/${branchName}`,
          false
        ),
      ]}
    />
  )
  const pathInput = screen.getByLabelText(/^Local path$/i) as HTMLInputElement
  await waitFor(() => assert.equal(pathInput.disabled, false))
  return { view, pathInput, onDismissed, postError, switchWorktree }
}

describe('AddWorktreeDialog directory persistence', () => {
  beforeEach(async () => {
    setDefaultDir(originalPath)
    const { ipcRenderer } = await import('electron')
    // Dialogs notify the main process when their menu state changes.
    const previousSend = ipcRenderer.send
    ipcRenderer.send = () => {}
    restoreIpcSend = () => {
      ipcRenderer.send = previousSend
    }
  })

  afterEach(() => {
    localStorage.clear()
    restoreIpcSend?.()
    restoreIpcSend = null
  })

  it('restores the chosen base directory when reopening for another branch', async t => {
    const repository = await setupEmptyRepository(t)
    await makeCommit(repository, {
      entries: [{ path: 'README.md', contents: 'worktree test' }],
    })
    await createBranch(repository, 'feature/first', 'HEAD')
    const basePath = await createTempDirectory(t)
    const dialog = await openDialog(repository, 'feature/first')
    assert.equal(dialog.pathInput.value, originalPath)
    fireEvent.change(dialog.pathInput, { target: { value: basePath } })
    fireEvent.click(
      screen.getByRole('button', { name: /^Create worktree$/i, hidden: true })
    )

    await waitFor(
      () => {
        assert.equal(dialog.postError.mock.callCount(), 0)
        assert.equal(dialog.onDismissed.mock.callCount(), 1)
      },
      { timeout: 10000 }
    )
    assert.equal(dialog.switchWorktree.mock.callCount(), 1)
    assert.equal(await getDefaultDir(), basePath)
    dialog.view.unmount()

    const reopened = await openDialog(repository, 'feature/second')
    assert.equal(reopened.pathInput.value, basePath)
    assert.ok(screen.getByText(Path.join(basePath, 'feature/second')))
  })

  it('keeps the previous directory when worktree creation fails', async t => {
    const repository = await setupEmptyRepository(t)
    await makeCommit(repository, {
      entries: [{ path: 'README.md', contents: 'worktree test' }],
    })
    const basePath = await createTempDirectory(t)
    // master is already checked out in the main worktree.
    const dialog = await openDialog(repository, 'master')
    fireEvent.change(dialog.pathInput, { target: { value: basePath } })
    fireEvent.click(
      screen.getByRole('button', { name: /^Create worktree$/i, hidden: true })
    )
    await waitFor(() => assert.equal(dialog.postError.mock.callCount(), 1), {
      timeout: 10000,
    })
    assert.equal(dialog.onDismissed.mock.callCount(), 0)
    assert.equal(await getDefaultDir(), originalPath)
  })
})
