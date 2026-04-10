import * as Path from 'path'

import {
  Repository,
  ILocalRepositoryState,
  nameOf,
} from '../../models/repository'
import { caseInsensitiveCompare } from '../../lib/compare'
import { normalizePath } from '../../lib/helpers/path'
import type { IAheadBehind } from '../../models/branch'
import type { WorktreeEntry } from '../../models/worktree'
import type {
  IRepositoryListItem,
  RepositoryListGroup,
  Repositoryish,
} from './group-repositories'

let nextVirtualRepositoryId = -1
const virtualRepositoryIdsByPath = new Map<string, number>()

export const getDisplayTitle = (repository: Repositoryish) =>
  repository instanceof Repository && repository.alias != null
    ? repository.alias
    : repository.name

const getLinkedWorktreeDisplayTitle = (
  repository: Repositoryish,
  worktreePath?: string
) =>
  repository instanceof Repository && repository.alias != null
    ? repository.alias
    : Path.basename(worktreePath ?? repository.path)

export const getRepositoryListTitle = (
  repository: Repositoryish,
  showWorktreesInSidebar: boolean
) =>
  showWorktreesInSidebar &&
  repository instanceof Repository &&
  repository.isLinkedWorktree
    ? getLinkedWorktreeDisplayTitle(repository)
    : getDisplayTitle(repository)

const getVirtualRepositoryId = (worktreePath: string) => {
  const normalizedPath = normalizePath(worktreePath)
  const existingId = virtualRepositoryIdsByPath.get(normalizedPath)
  if (existingId !== undefined) {
    return existingId
  }

  const id = nextVirtualRepositoryId--
  virtualRepositoryIdsByPath.set(normalizedPath, id)
  return id
}

const pruneVirtualRepositoryIds = (
  storedRepositoryPaths: ReadonlySet<string>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>
) => {
  const knownWorktreePaths = new Set<string>(storedRepositoryPaths)

  for (const state of localRepositoryStateLookup.values()) {
    for (const worktree of state.allWorktrees) {
      knownWorktreePaths.add(normalizePath(worktree.path))
    }
  }

  for (const worktreePath of virtualRepositoryIdsByPath.keys()) {
    if (!knownWorktreePaths.has(worktreePath)) {
      virtualRepositoryIdsByPath.delete(worktreePath)
    }
  }
}

const getBranchNameForWorktree = (worktree: WorktreeEntry) =>
  worktree.branch?.replace(/^refs\/heads\//, '') ?? null

const getWorktreeEntryForPath = (
  allWorktrees: ReadonlyArray<WorktreeEntry>,
  worktreePath: string
) =>
  allWorktrees.find(
    worktree => normalizePath(worktree.path) === normalizePath(worktreePath)
  ) ?? null

interface IToListItemOptions {
  readonly isVirtualLinkedWorktree?: boolean
  readonly worktreePath?: string
  readonly sourceRepository?: Repository | null
  readonly branchName?: string | null
  readonly changedFilesCount?: number
  readonly aheadBehind?: IAheadBehind | null
}

interface IToSortedListItemsOptions {
  readonly group: RepositoryListGroup
  readonly repositories: ReadonlyArray<Repositoryish>
  readonly localRepositoryStateLookup: ReadonlyMap<
    number,
    ILocalRepositoryState
  >
  readonly groupNames: ReadonlyMap<string, number>
  readonly allNames: ReadonlyMap<string, number>
  readonly repositoryByPath: ReadonlyMap<string, Repository>
  readonly storedRepositoryPaths: ReadonlySet<string>
  readonly showWorktreesInSidebar: boolean
}

export function toSortedRepositoryListItems({
  group,
  repositories,
  localRepositoryStateLookup,
  groupNames,
  allNames,
  repositoryByPath,
  storedRepositoryPaths,
  showWorktreesInSidebar,
}: IToSortedListItemsOptions): IRepositoryListItem[] {
  pruneVirtualRepositoryIds(storedRepositoryPaths, localRepositoryStateLookup)

  const toListItem = (
    repository: Repositoryish,
    isNestedWorktree: boolean,
    options?: IToListItemOptions
  ): IRepositoryListItem => {
    const repoState = localRepositoryStateLookup.get(repository.id)
    const isVirtualLinkedWorktree = options?.isVirtualLinkedWorktree ?? false
    const isLinkedWorktree =
      !isVirtualLinkedWorktree &&
      repository instanceof Repository &&
      repository.isLinkedWorktree
    const worktreePath = options?.worktreePath ?? repository.path
    const parentRepository =
      options?.sourceRepository ??
      (repository instanceof Repository && isLinkedWorktree
        ? repositoryByPath.get(normalizePath(repository.mainWorktreePath)) ??
          null
        : null)
    const parentRepoState =
      parentRepository !== null
        ? localRepositoryStateLookup.get(parentRepository.id)
        : null
    const startupWorktreeEntry =
      (isLinkedWorktree || isVirtualLinkedWorktree) && parentRepoState != null
        ? getWorktreeEntryForPath(parentRepoState.allWorktrees, worktreePath)
        : null
    const title =
      isLinkedWorktree || isVirtualLinkedWorktree
        ? getLinkedWorktreeDisplayTitle(repository, worktreePath)
        : getDisplayTitle(repository)
    const defaultBranchName =
      repoState?.defaultBranchName ??
      options?.sourceRepository?.defaultBranch ??
      (repository instanceof Repository ? repository.defaultBranch : null)
    const mainWorktreePath =
      isVirtualLinkedWorktree && options?.sourceRepository != null
        ? options.sourceRepository.mainWorktreePath
        : repository instanceof Repository
        ? repository.mainWorktreePath
        : options?.sourceRepository?.mainWorktreePath ?? repository.path
    const mainWorktreeName =
      (isLinkedWorktree || isVirtualLinkedWorktree) && isNestedWorktree
        ? Path.basename(mainWorktreePath)
        : null

    return {
      text:
        repository instanceof Repository
          ? isLinkedWorktree || isVirtualLinkedWorktree
            ? [title, nameOf(repository), Path.basename(mainWorktreePath)]
            : [title, nameOf(repository)]
          : [title],
      title,
      id: options?.worktreePath
        ? `worktree:${normalizePath(options.worktreePath)}`
        : repository.id.toString(),
      repository,
      needsDisambiguation:
        ((groupNames.get(title) ?? 0) > 1 && group.kind === 'enterprise') ||
        ((allNames.get(title) ?? 0) > 1 && group.kind === 'recent'),
      aheadBehind: options?.aheadBehind ?? repoState?.aheadBehind ?? null,
      changedFilesCount:
        options?.changedFilesCount ?? repoState?.changedFilesCount ?? 0,
      branchName:
        options?.branchName ??
        repoState?.branchName ??
        (startupWorktreeEntry
          ? getBranchNameForWorktree(startupWorktreeEntry)
          : null),
      defaultBranchName,
      isNestedWorktree,
      mainWorktreeName,
      isVirtualLinkedWorktree,
      isPrunableWorktree: startupWorktreeEntry?.isPrunable ?? false,
      worktreePath: options?.worktreePath ?? null,
      sourceRepository: options?.sourceRepository ?? parentRepository,
    }
  }

  const appendVirtualWorktreeItems = (
    items: IRepositoryListItem[],
    repository: Repository,
    sourceRepository: Repository,
    emittedVirtualPaths: Set<string>
  ) => {
    const repoState = localRepositoryStateLookup.get(repository.id)
    const allWorktrees = repoState?.allWorktrees ?? []
    const excludedPaths = new Set<string>([
      ...storedRepositoryPaths,
      ...emittedVirtualPaths,
      normalizePath(repository.path),
    ])
    const virtualWorktrees = allWorktrees
      .filter(
        worktree =>
          worktree.type === 'linked' &&
          !excludedPaths.has(normalizePath(worktree.path))
      )
      .sort((x, y) =>
        caseInsensitiveCompare(Path.basename(x.path), Path.basename(y.path))
      )

    for (const worktree of virtualWorktrees) {
      const virtualRepositoryPath = normalizePath(worktree.path)
      const virtualRepository = new Repository(
        worktree.path,
        getVirtualRepositoryId(virtualRepositoryPath),
        sourceRepository.gitHubRepository,
        false,
        null,
        sourceRepository.groupName,
        sourceRepository.defaultBranch,
        sourceRepository.workflowPreferences,
        sourceRepository.customEditorOverride,
        sourceRepository.gitSourceOverride,
        sourceRepository.isTutorialRepository,
        sourceRepository.overrideLogin
      )

      items.push(
        toListItem(virtualRepository, true, {
          isVirtualLinkedWorktree: true,
          worktreePath: worktree.path,
          sourceRepository,
          branchName: getBranchNameForWorktree(worktree),
          changedFilesCount: 0,
          aheadBehind: null,
        })
      )
      emittedVirtualPaths.add(virtualRepositoryPath)
    }
  }

  const sortedRepositories = [...repositories].sort((x, y) =>
    caseInsensitiveCompare(
      getRepositoryListTitle(x, showWorktreesInSidebar),
      getRepositoryListTitle(y, showWorktreesInSidebar)
    )
  )

  if (!showWorktreesInSidebar || group.kind === 'recent') {
    return sortedRepositories.map(repository => toListItem(repository, false))
  }

  const mainRepos: Repositoryish[] = []
  const orphanLinkedRepos: Repository[] = []
  const linkedReposByParentPath = new Map<string, Repository[]>()

  for (const repository of sortedRepositories) {
    if (!(repository instanceof Repository) || !repository.isLinkedWorktree) {
      mainRepos.push(repository)
      continue
    }

    const parentPath = normalizePath(repository.mainWorktreePath)
    const linkedRepos = linkedReposByParentPath.get(parentPath)
    if (linkedRepos !== undefined) {
      linkedRepos.push(repository)
    } else {
      linkedReposByParentPath.set(parentPath, [repository])
    }
  }

  const items: IRepositoryListItem[] = []
  const seenLinkedRepoIds = new Set<number>()
  const emittedVirtualPaths = new Set<string>()

  for (const repository of mainRepos) {
    items.push(toListItem(repository, false))

    if (!(repository instanceof Repository)) {
      continue
    }

    const linkedRepos = linkedReposByParentPath.get(
      normalizePath(repository.path)
    )
    if (linkedRepos !== undefined) {
      for (const linkedRepo of linkedRepos) {
        seenLinkedRepoIds.add(linkedRepo.id)
        items.push(toListItem(linkedRepo, true))
      }
    }

    appendVirtualWorktreeItems(
      items,
      repository,
      repository,
      emittedVirtualPaths
    )
  }

  for (const repository of sortedRepositories) {
    if (
      repository instanceof Repository &&
      repository.isLinkedWorktree &&
      !seenLinkedRepoIds.has(repository.id)
    ) {
      orphanLinkedRepos.push(repository)
    }
  }

  for (const repository of orphanLinkedRepos) {
    items.push(toListItem(repository, false))
  }

  return items
}
