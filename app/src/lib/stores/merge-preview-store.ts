import pLimit from 'p-limit'
import QuickLRU from 'quick-lru'
import { Disposable } from 'event-kit'
import { MergePreviewResult } from '../../models/merge'
import { Repository } from '../../models/repository'
import { getMergePreview } from '../git/merge-tree'

export type MergePreviewCallback = (preview: MergePreviewResult) => void

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
}
