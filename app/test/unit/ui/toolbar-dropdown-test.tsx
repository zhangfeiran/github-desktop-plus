import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { ToolbarDropdown } from '../../../src/ui/toolbar/dropdown'
import { fireEvent, render } from '../../helpers/ui/render'

describe('ToolbarDropdown', () => {
  it('resizes an open foldout by dragging its right edge', () => {
    const resizedWidths: number[] = []
    let resetCount = 0
    const view = render(
      <ToolbarDropdown
        title="Current branch"
        dropdownState="open"
        onDropdownStateChanged={() => {}}
        dropdownContentRenderer={() => <div>Branches</div>}
        enableFocusTrap={false}
        foldoutStyleOverrides={{ width: 365 }}
        foldoutResize={{
          width: 365,
          minimumWidth: 365,
          maximumWidth: 600,
          description: 'Branch dropdown list',
          onResize: width => resizedWidths.push(width),
          onReset: () => resetCount++,
        }}
      />
    )

    const handle = view.container.querySelector('.foldout .resize-handle')
    assert.notEqual(handle, null)
    if (handle === null) {
      throw new Error('Expected foldout resize handle to be rendered')
    }

    fireEvent.mouseDown(handle, { clientX: 365 })
    fireEvent.mouseMove(document, { clientX: 415 })
    fireEvent.mouseUp(document, { clientX: 415 })

    assert.equal(resizedWidths[resizedWidths.length - 1], 415)

    fireEvent.doubleClick(handle)
    assert.equal(resetCount, 1)
  })
})
