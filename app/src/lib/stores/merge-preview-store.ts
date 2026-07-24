import pLimit from 'p-limit'
import QuickLRU from 'quick-lru'
import { Disposable } from 'event-kit'
import { MergePreviewResult } from '../../models/merge'
import { Repository } from '../../models/repository'
import { getMergePreview } from '../git/merge-tree'
import { IChangesetData } from '../git/log'
import { getBranchDiffChangedFiles } from '../git/diff'

export type MergePreviewCallback = (preview: MergePreviewResult) => void
export type DiffPreviewCallback = (preview: IChangesetData) => void

function getCacheKey(repository: Repository, target: string, source: string) {
  return `${repository.path}:${target}:${source}`
}

const MaxConcurrent = 1

export class MergePreviewStore {
  private readonly cache = new QuickLRU<string, MergePreviewResult | null>({
    maxSize: 2500,
  })

  private readonly workers = new Map<
    string,
    Promise<MergePreviewResult | null>
  >()

  private readonly limit = pLimit(MaxConcurrent)

  private readonly diffCache = new QuickLRU<string, IChangesetData | null>({
    maxSize: 2500,
  })

  private readonly diffWorkers = new Map<
    string,
    Promise<IChangesetData | null>
  >()

  public tryGetMergePreview(
    repository: Repository,
    target: string,
    source: string
  ) {
    return this.cache.get(getCacheKey(repository, target, source)) ?? undefined
  }

  public getMergePreview(
    repository: Repository,
    target: string,
    source: string,
    callback: MergePreviewCallback
  ): Disposable {
    const key = getCacheKey(repository, target, source)
    const existing = this.cache.get(key)
    const disposable = new Disposable(() => {})

    if (existing === null) {
      return disposable
    }

    if (existing !== undefined) {
      callback(existing)
      return disposable
    }

    this.limit(async () => {
      const existing = this.cache.get(key)

      if (disposable.disposed || existing === null) {
        return
      }

      if (existing !== undefined) {
        callback(existing)
        return
      }

      let worker = this.workers.get(key)

      if (worker === undefined) {
        worker = getMergePreview(repository, target, source)
          .catch(e => {
            log.error('Failed calculating merge preview', e)
            return null
          })
          .then(preview => {
            this.cache.set(key, preview)
            return preview
          })
          .finally(() => this.workers.delete(key))

        this.workers.set(key, worker)
      }

      const preview = await worker

      if (preview !== null && !disposable.disposed) {
        callback(preview)
      }
    }).catch(e => log.error('Failed calculating merge preview', e))

    return disposable
  }

  public tryGetDiffPreview(
    repository: Repository,
    target: string,
    source: string
  ) {
    return (
      this.diffCache.get(getCacheKey(repository, target, source)) ?? undefined
    )
  }

  public getDiffPreview(
    repository: Repository,
    target: string,
    source: string,
    callback: DiffPreviewCallback
  ): Disposable {
    const key = getCacheKey(repository, target, source)
    const existing = this.diffCache.get(key)
    const disposable = new Disposable(() => {})

    if (existing === null) {
      return disposable
    }
    if (existing !== undefined) {
      callback(existing)
      return disposable
    }

    this.limit(async () => {
      const cached = this.diffCache.get(key)
      if (disposable.disposed || cached === null) {
        return
      }
      if (cached !== undefined) {
        callback(cached)
        return
      }

      let worker = this.diffWorkers.get(key)
      if (worker === undefined) {
        worker = getBranchDiffChangedFiles(repository, target, source)
          .catch(e => {
            log.error('Failed calculating branch diff preview', e)
            return null
          })
          .then(preview => {
            this.diffCache.set(key, preview)
            return preview
          })
          .finally(() => this.diffWorkers.delete(key))
        this.diffWorkers.set(key, worker)
      }

      const preview = await worker
      if (preview !== null && !disposable.disposed) {
        callback(preview)
      }
    }).catch(e => log.error('Failed calculating branch diff preview', e))

    return disposable
  }
}
