import { ComputedAction } from './computed-action'

export type MergePreviewFileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'conflicted'

export type MergePreviewFile = {
  readonly path: string
  readonly oldPath?: string
  readonly status: MergePreviewFileStatus
}

interface IBlobResult {
  readonly mode: string
  readonly sha: string
  readonly path: string
}

export interface IMergeTreeEntry {
  readonly context: string
  readonly base?: IBlobResult
  readonly result?: IBlobResult
  readonly our?: IBlobResult
  readonly their?: IBlobResult
  readonly diff: string
  readonly hasConflicts?: boolean
}

export type MergeTreeSuccess = {
  readonly kind: ComputedAction.Clean
}

export type MergeTreeError = {
  readonly kind: ComputedAction.Conflicts
  readonly conflictedFiles: number
}

export type MergeTreeUnsupported = {
  readonly kind: ComputedAction.Invalid
}

export type MergeTreeLoading = {
  readonly kind: ComputedAction.Loading
}

export type MergeTreeResult =
  | MergeTreeSuccess
  | MergeTreeError
  | MergeTreeUnsupported
  | MergeTreeLoading

export type MergePreviewClean = {
  readonly kind: ComputedAction.Clean
  readonly mergeTree: string
  readonly changedFiles: number
  readonly linesAdded: number
  readonly linesDeleted: number
  readonly conflictedFiles: 0
  readonly files: ReadonlyArray<MergePreviewFile>
}

export type MergePreviewConflicts = {
  readonly kind: ComputedAction.Conflicts
  readonly mergeTree: string
  readonly changedFiles: number
  readonly linesAdded: number
  readonly linesDeleted: number
  readonly conflictedFiles: number
  readonly files: ReadonlyArray<MergePreviewFile>
}

export type MergePreviewUnsupported = {
  readonly kind: ComputedAction.Invalid
}

export type MergePreviewResult =
  | MergePreviewClean
  | MergePreviewConflicts
  | MergePreviewUnsupported
