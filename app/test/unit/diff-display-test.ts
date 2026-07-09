import { describe, it } from 'node:test'
import assert from 'node:assert'

import { getEffectiveShowSideBySideDiff } from '../../src/ui/diff/diff-display'
import { AppFileStatusKind } from '../../src/models/status'

describe('diff-display', () => {
  it('temporarily shows new files as unified when split is selected', () => {
    assert.equal(
      getEffectiveShowSideBySideDiff(true, { kind: AppFileStatusKind.New }),
      false
    )
  })

  it('temporarily shows untracked files as unified when split is selected', () => {
    assert.equal(
      getEffectiveShowSideBySideDiff(true, {
        kind: AppFileStatusKind.Untracked,
      }),
      false
    )
  })

  it('temporarily shows deleted files as unified when split is selected', () => {
    assert.equal(
      getEffectiveShowSideBySideDiff(true, { kind: AppFileStatusKind.Deleted }),
      false
    )
  })

  it('preserves the selected display mode for modified files', () => {
    assert.equal(
      getEffectiveShowSideBySideDiff(true, {
        kind: AppFileStatusKind.Modified,
      }),
      true
    )
    assert.equal(
      getEffectiveShowSideBySideDiff(false, {
        kind: AppFileStatusKind.Modified,
      }),
      false
    )
  })
})
