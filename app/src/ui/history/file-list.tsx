import * as React from 'react'
import { mapStatus } from '../../lib/status'

import { CommittedFileChange } from '../../models/status'
import { ClickSource, List } from '../lib/list'
import { CommittedFileItem } from './committed-file-item'
import { getDiffStatsLabel } from '../diff/file-diff-stats'

interface IFileListProps {
  readonly files: ReadonlyArray<CommittedFileChange>
  readonly selectedFiles: ReadonlyArray<CommittedFileChange>
  readonly onSelectionChanged: (
    files: ReadonlyArray<CommittedFileChange>
  ) => void
  readonly onRowDoubleClick: (row: number, source: ClickSource) => void
  readonly availableWidth: number
  readonly onContextMenu?: (
    file: CommittedFileChange,
    event: React.MouseEvent<HTMLDivElement>
  ) => void
}

interface IFileListState {
  readonly focusedRow: number | null
}

/**
 * Display a list of changed files as part of a commit or stash
 */
export class FileList extends React.Component<IFileListProps, IFileListState> {
  public constructor(props: IFileListProps) {
    super(props)

    this.state = {
      focusedRow: null,
    }
  }

  private onSelectionChanged = (rows: ReadonlyArray<number>) => {
    const files = rows
      .map(r => this.props.files[r])
      .filter((f): f is CommittedFileChange => f !== undefined)
    this.props.onSelectionChanged(files)
  }

  private renderFile = (row: number) => {
    return (
      <CommittedFileItem
        file={this.props.files[row]}
        availableWidth={this.props.availableWidth}
        focused={this.state.focusedRow === row}
      />
    )
  }

  private selectedRowsForFiles(): ReadonlyArray<number> {
    const { selectedFiles, files } = this.props
    return selectedFiles
      .map(sf => files.findIndex(f => f.path === sf.path))
      .filter(i => i >= 0)
  }

  private onRowContextMenu = (
    row: number,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    this.props.onContextMenu?.(this.props.files[row], event)
  }

  private getFileAriaLabel = (row: number) => {
    const file = this.props.files[row]
    const { path, status } = file
    const fileStatus = mapStatus(status)
    const stats =
      status.submoduleStatus === undefined ? file.diffStats : undefined
    return `${path} ${fileStatus} ${getDiffStatsLabel(stats)}`.trim()
  }

  public render() {
    return (
      <div className="file-list">
        <List
          rowRenderer={this.renderFile}
          rowCount={this.props.files.length}
          rowHeight={29}
          selectionMode="multi"
          selectedRows={this.selectedRowsForFiles()}
          onSelectionChanged={this.onSelectionChanged}
          onRowDoubleClick={this.props.onRowDoubleClick}
          onRowContextMenu={this.onRowContextMenu}
          onRowKeyboardFocus={this.onRowFocus}
          onRowBlur={this.onRowBlur}
          getRowAriaLabel={this.getFileAriaLabel}
          invalidationProps={{
            focusedRow: this.state.focusedRow,
            files: this.props.files,
            availableWidth: this.props.availableWidth,
          }}
        />
      </div>
    )
  }

  private onRowFocus = (row: number) => {
    this.setState({ focusedRow: row })
  }

  private onRowBlur = (row: number) => {
    if (this.state.focusedRow === row) {
      this.setState({ focusedRow: null })
    }
  }
}
