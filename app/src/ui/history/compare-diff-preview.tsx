import * as React from 'react'
import classNames from 'classnames'
import type { Disposable } from 'event-kit'

import {
  BranchPreviewKind,
  ComparisonMode,
  ICompareBranch,
  IMergePreviewSelection,
} from '../../lib/app-state'
import { formatNumber } from '../../lib/format-number'
import { IChangesetData } from '../../lib/git/log'
import { MergePreviewStore } from '../../lib/stores/merge-preview-store'
import { Branch } from '../../models/branch'
import { Repository } from '../../models/repository'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Ref } from '../lib/ref'
import { plural } from '../lib/plural'

interface ICompareDiffPreviewProps {
  readonly repository: Repository
  readonly mergePreviewStore: MergePreviewStore
  readonly currentBranch: Branch | null
  readonly view: ICompareBranch
  readonly selectedPreview: IMergePreviewSelection | null
  readonly onSelected: (selection: IMergePreviewSelection) => void
}

interface ICompareDiffPreviewState {
  readonly targetSHA?: string
  readonly sourceSHA?: string
  readonly preview?: IChangesetData
}

export class CompareDiffPreview extends React.Component<
  ICompareDiffPreviewProps,
  ICompareDiffPreviewState
> {
  private subscription: Disposable | null = null

  public constructor(props: ICompareDiffPreviewProps) {
    super(props)
    this.state = this.getState(props)
  }

  public componentDidMount() {
    this.subscribe()
  }

  public componentDidUpdate(prevProps: ICompareDiffPreviewProps) {
    const state = this.getState(this.props)
    if (
      state.targetSHA !== this.state.targetSHA ||
      state.sourceSHA !== this.state.sourceSHA
    ) {
      this.setState(state, () => this.subscribe())
    } else if (prevProps.repository !== this.props.repository) {
      this.subscribe()
    }
  }

  public componentWillUnmount() {
    this.subscription?.dispose()
  }

  private getState(props: ICompareDiffPreviewProps): ICompareDiffPreviewState {
    const details = getDetails(props)
    if (details === null) {
      return {}
    }
    const targetSHA = details.targetBranch.tip.sha
    const sourceSHA = details.sourceBranch.tip.sha
    return {
      targetSHA,
      sourceSHA,
      preview: props.mergePreviewStore.tryGetDiffPreview(
        props.repository,
        targetSHA,
        sourceSHA
      ),
    }
  }

  private subscribe() {
    this.subscription?.dispose()
    this.subscription = null
    const { targetSHA, sourceSHA, preview } = this.state
    if (
      targetSHA === undefined ||
      sourceSHA === undefined ||
      preview !== undefined
    ) {
      return
    }
    this.subscription = this.props.mergePreviewStore.getDiffPreview(
      this.props.repository,
      targetSHA,
      sourceSHA,
      preview => this.setState({ preview })
    )
  }

  public render() {
    const details = getDetails(this.props)
    if (details === null) {
      return null
    }
    const { targetBranch, sourceBranch } = details
    const selection: IMergePreviewSelection = {
      kind: BranchPreviewKind.Diff,
      comparisonMode: this.props.view.comparisonMode,
      targetBranchName: targetBranch.name,
      sourceBranchName: sourceBranch.name,
      targetSHA: targetBranch.tip.sha,
      sourceSHA: sourceBranch.tip.sha,
    }
    const isSelected =
      this.props.selectedPreview !== null &&
      previewsEqual(selection, this.props.selectedPreview)
    const summary =
      this.state.preview === undefined
        ? 'Loading diff preview...'
        : `${formatNumber(
            this.state.preview.files.length
          )} changed file${plural(this.state.preview.files.length)}`

    return (
      <div className="compare-merge-preview">
        <button
          type="button"
          className={classNames('compare-merge-preview-row', {
            selected: isSelected,
            disabled: this.state.preview === undefined,
          })}
          disabled={this.state.preview === undefined}
          aria-pressed={isSelected}
          onClick={() => this.props.onSelected(selection)}
        >
          <Octicon symbol={octicons.fileDiff} className="merge-preview-icon" />
          <span className="compare-merge-preview-title">Diff preview</span>
          <span className="compare-merge-preview-summary">
            {summary} from <Ref>{targetBranch.name}</Ref> to{' '}
            <Ref>{sourceBranch.name}</Ref>
          </span>
        </button>
      </div>
    )
  }
}

function getDetails(props: ICompareDiffPreviewProps) {
  if (props.currentBranch === null) {
    return null
  }
  return props.view.comparisonMode === ComparisonMode.Behind
    ? {
        targetBranch: props.currentBranch,
        sourceBranch: props.view.comparisonBranch,
      }
    : {
        targetBranch: props.view.comparisonBranch,
        sourceBranch: props.currentBranch,
      }
}

function previewsEqual(a: IMergePreviewSelection, b: IMergePreviewSelection) {
  return (
    a.kind === b.kind &&
    a.comparisonMode === b.comparisonMode &&
    a.targetSHA === b.targetSHA &&
    a.sourceSHA === b.sourceSHA
  )
}
