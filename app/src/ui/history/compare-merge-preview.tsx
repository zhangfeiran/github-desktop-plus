import * as React from 'react'
import classNames from 'classnames'

import type { Disposable } from 'event-kit'
import {
  ComparisonMode,
  ICompareBranch,
  IMergePreviewSelection,
} from '../../lib/app-state'
import { MergePreviewStore } from '../../lib/stores/merge-preview-store'
import { formatNumber } from '../../lib/format-number'
import { ComputedAction } from '../../models/computed-action'
import { MergePreviewResult } from '../../models/merge'
import { Branch } from '../../models/branch'
import { Repository } from '../../models/repository'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Ref } from '../lib/ref'
import { plural } from '../lib/plural'

interface ICompareMergePreviewProps {
  readonly repository: Repository
  readonly mergePreviewStore: MergePreviewStore
  readonly currentBranch: Branch | null
  readonly view: ICompareBranch
  readonly selectedMergePreview: IMergePreviewSelection | null
  readonly onSelected: (selection: IMergePreviewSelection) => void
}

interface ICompareMergePreviewState {
  readonly targetSHA?: string
  readonly sourceSHA?: string
  readonly preview?: MergePreviewResult
}

type CompareMergePreviewDetails = {
  readonly targetBranch: Branch
  readonly sourceBranch: Branch
  readonly commitCount: number
}

export class CompareMergePreview extends React.Component<
  ICompareMergePreviewProps,
  ICompareMergePreviewState
> {
  public static getDerivedStateFromProps(
    props: ICompareMergePreviewProps,
    state: ICompareMergePreviewState
  ): Partial<ICompareMergePreviewState> | null {
    const details = getCompareMergePreviewDetails(props)
    const targetSHA = details?.targetBranch.tip.sha
    const sourceSHA = details?.sourceBranch.tip.sha

    if (targetSHA === state.targetSHA && sourceSHA === state.sourceSHA) {
      return null
    }

    if (
      details === null ||
      targetSHA === undefined ||
      sourceSHA === undefined ||
      details.commitCount <= 0
    ) {
      return { targetSHA, sourceSHA, preview: undefined }
    }

    const preview = props.mergePreviewStore.tryGetMergePreview(
      props.repository,
      targetSHA,
      sourceSHA
    )

    return { targetSHA, sourceSHA, preview }
  }

  private mergePreviewSubscription: Disposable | null = null

  public constructor(props: ICompareMergePreviewProps) {
    super(props)
    this.state = {}
  }

  public componentDidMount() {
    this.subscribeToMergePreviewStore()
  }

  public componentDidUpdate(
    prevProps: ICompareMergePreviewProps,
    prevState: ICompareMergePreviewState
  ) {
    const { targetSHA, sourceSHA } = this.state

    if (
      prevState.targetSHA !== targetSHA ||
      prevState.sourceSHA !== sourceSHA
    ) {
      this.subscribeToMergePreviewStore()
    }
  }

  public componentWillUnmount() {
    this.unsubscribeFromMergePreviewStore()
  }

  private subscribeToMergePreviewStore() {
    const details = getCompareMergePreviewDetails(this.props)
    const { targetSHA, sourceSHA, preview } = this.state

    this.unsubscribeFromMergePreviewStore()

    if (
      details === null ||
      targetSHA === undefined ||
      sourceSHA === undefined ||
      preview !== undefined ||
      details.commitCount <= 0
    ) {
      return
    }

    this.mergePreviewSubscription =
      this.props.mergePreviewStore.getMergePreview(
        this.props.repository,
        targetSHA,
        sourceSHA,
        preview => this.setState({ preview })
      )
  }

  private unsubscribeFromMergePreviewStore() {
    if (this.mergePreviewSubscription !== null) {
      this.mergePreviewSubscription.dispose()
      this.mergePreviewSubscription = null
    }
  }

  public render() {
    const details = getCompareMergePreviewDetails(this.props)

    if (details === null) {
      return null
    }

    const { targetBranch, sourceBranch, commitCount } = details

    if (commitCount <= 0) {
      return this.renderPreviewRow({
        sourceBranch,
        targetBranch,
        summary: 'No files would change',
        disabled: true,
      })
    }

    const { preview } = this.state

    if (preview === undefined) {
      return this.renderPreviewRow({
        sourceBranch,
        targetBranch,
        summary: 'Loading merge preview...',
        disabled: true,
      })
    }

    if (preview.kind === ComputedAction.Invalid) {
      return this.renderPreviewRow({
        sourceBranch,
        targetBranch,
        summary: 'Unable to preview unrelated histories',
        disabled: true,
      })
    }

    const changedFiles = preview.changedFiles
    const summary = `${formatNumber(changedFiles)} changed file${plural(
      changedFiles
    )}`
    const conflictSummary =
      preview.kind === ComputedAction.Conflicts
        ? `, ${formatNumber(preview.conflictedFiles)} conflicted`
        : ''

    return this.renderPreviewRow({
      sourceBranch,
      targetBranch,
      summary: `${summary}${conflictSummary}`,
      hasConflicts: preview.kind === ComputedAction.Conflicts,
      selection: {
        comparisonMode: this.props.view.comparisonMode,
        targetBranchName: targetBranch.name,
        sourceBranchName: sourceBranch.name,
        targetSHA: targetBranch.tip.sha,
        sourceSHA: sourceBranch.tip.sha,
      },
    })
  }

  private renderPreviewRow(args: {
    readonly summary: string
    readonly sourceBranch: Branch
    readonly targetBranch: Branch
    readonly selection?: IMergePreviewSelection
    readonly hasConflicts?: boolean
    readonly disabled?: boolean
  }) {
    const {
      summary,
      sourceBranch,
      targetBranch,
      selection,
      hasConflicts = false,
      disabled = false,
    } = args
    const className = hasConflicts
      ? 'compare-merge-preview-summary has-conflicts'
      : 'compare-merge-preview-summary'
    const isSelected =
      selection !== undefined &&
      this.props.selectedMergePreview !== null &&
      mergePreviewSelectionsEqual(selection, this.props.selectedMergePreview)
    const rowClassName = classNames('compare-merge-preview-row', {
      selected: isSelected,
      disabled,
    })

    return (
      <div className="compare-merge-preview">
        <button
          type="button"
          className={rowClassName}
          disabled={disabled || selection === undefined}
          aria-pressed={isSelected}
          onClick={
            selection === undefined
              ? undefined
              : () => this.props.onSelected(selection)
          }
        >
          <Octicon symbol={octicons.fileDiff} className="merge-preview-icon" />
          <span className="compare-merge-preview-title">Merge preview</span>
          <span className={className}>
            {summary} when merging <Ref>{sourceBranch.name}</Ref> into{' '}
            <Ref>{targetBranch.name}</Ref>
          </span>
        </button>
      </div>
    )
  }
}

function getCompareMergePreviewDetails(
  props: ICompareMergePreviewProps
): CompareMergePreviewDetails | null {
  const { currentBranch, view } = props

  if (currentBranch === null) {
    return null
  }

  if (view.comparisonMode === ComparisonMode.Behind) {
    return {
      targetBranch: currentBranch,
      sourceBranch: view.comparisonBranch,
      commitCount: view.aheadBehind.behind,
    }
  }

  return {
    targetBranch: view.comparisonBranch,
    sourceBranch: currentBranch,
    commitCount: view.aheadBehind.ahead,
  }
}

function mergePreviewSelectionsEqual(
  a: IMergePreviewSelection,
  b: IMergePreviewSelection
) {
  return (
    a.comparisonMode === b.comparisonMode &&
    a.targetBranchName === b.targetBranchName &&
    a.sourceBranchName === b.sourceBranchName &&
    a.targetSHA === b.targetSHA &&
    a.sourceSHA === b.sourceSHA
  )
}
