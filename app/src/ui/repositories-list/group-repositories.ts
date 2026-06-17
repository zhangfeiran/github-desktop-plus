import * as Path from 'path'

import {
  Repository,
  ILocalRepositoryState,
  nameOf,
  isRepositoryWithGitHubRepository,
  RepositoryWithGitHubRepository,
} from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import { getHTMLURL } from '../../lib/api'
import { caseInsensitiveCompare, compare } from '../../lib/compare'
import type { IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { IAheadBehind } from '../../models/branch'
import { WorktreeEntry } from '../../models/worktree'
import { assertNever } from '../../lib/fatal-error'
import { isGHE, isGHES } from '../../lib/endpoint-capabilities'
import { Owner } from '../../models/owner'
import { normalizePath } from '../../lib/helpers/path'

export type RepositoryListGroup = (
  | {
      kind: 'recent' | 'other' | 'pins'
    }
  | {
      kind: 'dotcom'
      owner: Owner
      login: string | null
    }
  | {
      kind: 'enterprise'
      host: string
    }
) & { displayName: string | null }

/**
 * Returns a unique grouping key (string) for a repository group. Doubles as a
 * case sensitive sorting key (i.e the case sensitive sort order of the keys is
 * the order in which the groups will be displayed in the repository list).
 */
export const getGroupKey = (group: RepositoryListGroup) => {
  const { kind, displayName } = group
  switch (kind) {
    case 'pins':
      return `-1:pins`
    case 'recent':
      return `0:recent`
    case 'dotcom':
      return displayName
        ? `1:${displayName}`
        : `1:${group.owner.login}:${group.login ?? group.owner.login}`
    case 'enterprise':
      // Allow mixing together dotcom and enterprise repos when setting a group name manually
      return displayName ? `1:${displayName}` : `2:${group.host}`
    case 'other':
      return displayName ? `1:${displayName}` : `3:other`
    default:
      assertNever(group, `Unknown repository group kind ${kind}`)
  }
}
export type Repositoryish = Repository | CloningRepository

export interface IRepositoryListItem extends IFilterListItem {
  readonly text: ReadonlyArray<string>
  readonly id: string
  readonly repository: Repositoryish
  readonly needsDisambiguation: boolean
  readonly aheadBehind: IAheadBehind | null
  readonly changedFilesCount: number
  readonly branchName: string | null
  readonly defaultBranchName: string | null
  readonly title: string
  readonly isNestedWorktree: boolean
  readonly mainWorktreeName: string | null
  readonly isVirtualLinkedWorktree: boolean
  readonly isPrunableWorktree: boolean
  readonly worktreePath: string | null
  readonly sourceRepository: Repository | null
  /**
   * The worktree this row represents, when worktrees are shown in the list.
   *
   * The repository row carries the main worktree (so clicking it switches to
   * the main worktree); linked worktrees each get their own row nested below
   * it. `null` when worktree info isn't available (feature disabled or not yet
   * loaded), in which case the row is a plain repository row.
   */
  readonly worktree: WorktreeEntry | null
}

interface IGroupRepositoriesOptions {
  readonly showWorktreesInSidebar?: boolean
  readonly selectedRepository?: Repositoryish | null
}

const recentRepositoriesThreshold = 7

const getHostForRepository = (repo: RepositoryWithGitHubRepository) =>
  new URL(getHTMLURL(repo.gitHubRepository.endpoint)).host

const getGroupForRepository = (repo: Repositoryish): RepositoryListGroup => {
  if (repo instanceof Repository && isRepositoryWithGitHubRepository(repo)) {
    return isGHE(repo.gitHubRepository.endpoint) ||
      isGHES(repo.gitHubRepository.endpoint)
      ? {
          kind: 'enterprise',
          host: getHostForRepository(repo),
          displayName: repo.groupName,
        }
      : {
          kind: 'dotcom',
          owner: repo.gitHubRepository.owner,
          displayName: repo.groupName,
          login: repo.gitHubRepository.login,
        }
  }
  if (repo instanceof Repository) {
    return { kind: 'other', displayName: repo.groupName }
  }
  return { kind: 'other', displayName: null }
}

type RepoGroupItem = { group: RepositoryListGroup; repos: Repositoryish[] }

let nextVirtualRepositoryId = -1
const virtualRepositoryIdsByPath = new Map<string, number>()

// Returns the display title for a repository, which is either the alias
// (if available) or the name.
const getDisplayTitle = (repository: Repositoryish) =>
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

const getRepositoryListTitle = (
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
    for (const worktree of state.worktrees) {
      knownWorktreePaths.add(normalizePath(worktree.path))
    }
  }

  for (const worktreePath of virtualRepositoryIdsByPath.keys()) {
    if (!knownWorktreePaths.has(worktreePath)) {
      virtualRepositoryIdsByPath.delete(worktreePath)
    }
  }
}

const shortBranchName = (branch: string | null): string | null =>
  branch ? branch.replace(/^refs\/heads\//, '') : null

const getBranchNameForWorktree = (worktree: WorktreeEntry) =>
  shortBranchName(worktree.branch)

const getWorktreeEntryForPath = (
  allWorktrees: ReadonlyArray<WorktreeEntry>,
  worktreePath: string
) =>
  allWorktrees.find(
    worktree => normalizePath(worktree.path) === normalizePath(worktreePath)
  ) ?? null

export function groupRepositories(
  repositories: ReadonlyArray<Repositoryish>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
  recentRepositories: ReadonlyArray<number>,
  options: IGroupRepositoriesOptions = {}
): ReadonlyArray<IFilterListGroup<IRepositoryListItem, RepositoryListGroup>> {
  const showWorktreesInSidebar = options.showWorktreesInSidebar ?? false
  const selectedRepository = options.selectedRepository ?? null
  const groups = new Map<string, RepoGroupItem>()
  const repositoryById = new Map<number, Repository>()
  const repositoryByPath = new Map<string, Repository>()
  const storedRepositoryPaths = new Set<string>()

  for (const repository of repositories) {
    if (!(repository instanceof Repository)) {
      continue
    }

    const normalizedPath = normalizePath(repository.path)
    repositoryById.set(repository.id, repository)
    repositoryByPath.set(normalizedPath, repository)
    storedRepositoryPaths.add(normalizedPath)
  }

  const preferredLinkedWorktreeByMainPath = new Map<string, string>()
  const setPreferredLinkedWorktree = (repository: Repository) => {
    if (!repository.isLinkedWorktree) {
      return
    }

    const repositoryPath = normalizePath(repository.path)
    const mainPath = normalizePath(repository.mainWorktreePath)
    if (
      !repositoryByPath.has(repositoryPath) ||
      !repositoryByPath.has(mainPath)
    ) {
      return
    }

    if (!preferredLinkedWorktreeByMainPath.has(mainPath)) {
      preferredLinkedWorktreeByMainPath.set(mainPath, repositoryPath)
    }
  }

  if (selectedRepository instanceof Repository) {
    setPreferredLinkedWorktree(selectedRepository)
  }

  for (const id of recentRepositories) {
    const repository = repositoryById.get(id)
    if (repository !== undefined) {
      setPreferredLinkedWorktree(repository)
    }
  }

  const shouldShowRepository = (repository: Repositoryish) => {
    if (showWorktreesInSidebar || !(repository instanceof Repository)) {
      return true
    }

    if (!repository.isLinkedWorktree) {
      return !preferredLinkedWorktreeByMainPath.has(
        normalizePath(repository.path)
      )
    }

    const parentPath = normalizePath(repository.mainWorktreePath)
    if (!repositoryByPath.has(parentPath)) {
      return true
    }

    return (
      preferredLinkedWorktreeByMainPath.get(parentPath) ===
      normalizePath(repository.path)
    )
  }

  const visibleRepositories = repositories.filter(shouldShowRepository)
  const includeRecentGroup =
    visibleRepositories.length > recentRepositoriesThreshold
  const recentSet = includeRecentGroup ? new Set(recentRepositories) : undefined

  const addToGroup = (group: RepositoryListGroup, repo: Repositoryish) => {
    const key = getGroupKey(group)
    let rg = groups.get(key)
    if (!rg) {
      rg = { group, repos: [] }
      groups.set(key, rg)
    }

    rg.repos.push(repo)
  }

  for (const repo of visibleRepositories) {
    if (recentSet?.has(repo.id) && repo instanceof Repository) {
      addToGroup({ kind: 'recent', displayName: repo.groupName }, repo)
    }

    const parentRepo =
      repo instanceof Repository &&
      repo.isLinkedWorktree &&
      (showWorktreesInSidebar ||
        preferredLinkedWorktreeByMainPath.get(
          normalizePath(repo.mainWorktreePath)
        ) === normalizePath(repo.path))
        ? repositoryByPath.get(normalizePath(repo.mainWorktreePath))
        : undefined

    addToGroup(getGroupForRepository(parentRepo ?? repo), repo)
  }

  return Array.from(groups)
    .sort(([xKey], [yKey]) => compare(xKey.toLowerCase(), yKey.toLowerCase()))
    .map(([, { group, repos }]) => ({
      identifier: group,
      items: toSortedListItems(
        group,
        repos,
        localRepositoryStateLookup,
        groups,
        repositoryByPath,
        storedRepositoryPaths,
        options
      ),
    }))
}

const toSortedListItems = (
  group: RepositoryListGroup,
  repositories: ReadonlyArray<Repositoryish>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
  groups: Map<string, RepoGroupItem>,
  repositoryByPath: ReadonlyMap<string, Repository>,
  storedRepositoryPaths: ReadonlySet<string>,
  options: IGroupRepositoriesOptions
): IRepositoryListItem[] => {
  const showWorktreesInSidebar = options.showWorktreesInSidebar ?? false
  const groupNames = new Map<string, number>()
  const allNames = new Map<string, number>()

  for (const groupItem of groups.values()) {
    // All items in the recent group are by definition present in another
    // group and therefore we don't want to count them.
    if (groupItem.group.kind === 'recent') {
      continue
    }

    for (const title of groupItem.repos.map(repo =>
      getRepositoryListTitle(repo, showWorktreesInSidebar)
    )) {
      allNames.set(title, (allNames.get(title) ?? 0) + 1)
      if (groupItem.group === group) {
        groupNames.set(title, (groupNames.get(title) ?? 0) + 1)
      }
    }
  }

  pruneVirtualRepositoryIds(storedRepositoryPaths, localRepositoryStateLookup)

  const sortedRepositories = [...repositories].sort((x, y) =>
    caseInsensitiveCompare(
      getRepositoryListTitle(x, showWorktreesInSidebar),
      getRepositoryListTitle(y, showWorktreesInSidebar)
    )
  )

  if (!showWorktreesInSidebar || group.kind === 'recent') {
    return sortedRepositories.map(repository =>
      buildRepositoryRow(
        group,
        repository,
        false,
        showWorktreesInSidebar,
        localRepositoryStateLookup,
        groupNames,
        allNames,
        repositoryByPath
      )
    )
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
    items.push(
      buildRepositoryRow(
        group,
        repository,
        false,
        showWorktreesInSidebar,
        localRepositoryStateLookup,
        groupNames,
        allNames,
        repositoryByPath
      )
    )

    if (!(repository instanceof Repository)) {
      continue
    }

    const linkedRepos = linkedReposByParentPath.get(
      normalizePath(repository.path)
    )
    if (linkedRepos !== undefined) {
      for (const linkedRepo of linkedRepos) {
        seenLinkedRepoIds.add(linkedRepo.id)
        items.push(
          buildRepositoryRow(
            group,
            linkedRepo,
            true,
            showWorktreesInSidebar,
            localRepositoryStateLookup,
            groupNames,
            allNames,
            repositoryByPath
          )
        )
      }
    }

    appendVirtualWorktreeRows(
      items,
      group,
      repository,
      repository,
      localRepositoryStateLookup,
      groupNames,
      allNames,
      repositoryByPath,
      storedRepositoryPaths,
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
    items.push(
      buildRepositoryRow(
        group,
        repository,
        false,
        showWorktreesInSidebar,
        localRepositoryStateLookup,
        groupNames,
        allNames,
        repositoryByPath
      )
    )
  }

  return items
}

interface IBuildRepositoryRowOptions {
  readonly isVirtualLinkedWorktree?: boolean
  readonly worktreePath?: string
  readonly sourceRepository?: Repository | null
  readonly branchName?: string | null
  readonly changedFilesCount?: number
  readonly aheadBehind?: IAheadBehind | null
}

function buildRepositoryRow(
  group: RepositoryListGroup,
  repository: Repositoryish,
  isNestedWorktree: boolean,
  showWorktreesInSidebar: boolean,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
  groupNames: ReadonlyMap<string, number>,
  allNames: ReadonlyMap<string, number>,
  repositoryByPath: ReadonlyMap<string, Repository>,
  options?: IBuildRepositoryRowOptions
): IRepositoryListItem {
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
      ? repositoryByPath.get(normalizePath(repository.mainWorktreePath)) ?? null
      : null)
  const parentRepoState =
    parentRepository !== null
      ? localRepositoryStateLookup.get(parentRepository.id)
      : null
  const mainWorktreeEntry =
    repoState?.worktrees.find(worktree => worktree.type === 'main') ?? null
  const currentWorktreeEntry =
    repoState !== undefined
      ? getWorktreeEntryForPath(repoState.worktrees, worktreePath)
      : null
  const startupWorktreeEntry =
    (isLinkedWorktree || isVirtualLinkedWorktree) && parentRepoState != null
      ? getWorktreeEntryForPath(parentRepoState.worktrees, worktreePath)
      : null
  const rowWorktree = showWorktreesInSidebar
    ? startupWorktreeEntry ?? mainWorktreeEntry
    : startupWorktreeEntry ?? currentWorktreeEntry
  const shouldUseWorktreeTitle =
    showWorktreesInSidebar && (isLinkedWorktree || isVirtualLinkedWorktree)
  const title = shouldUseWorktreeTitle
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
    showWorktreesInSidebar &&
    (isLinkedWorktree || isVirtualLinkedWorktree) &&
    isNestedWorktree
      ? Path.basename(mainWorktreePath)
      : null

  return {
    text:
      repository instanceof Repository
        ? shouldUseWorktreeTitle
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
    isPrunableWorktree: rowWorktree?.isPrunable ?? false,
    worktreePath: options?.worktreePath ?? null,
    sourceRepository: options?.sourceRepository ?? parentRepository,
    worktree: rowWorktree,
  }
}

function appendVirtualWorktreeRows(
  items: IRepositoryListItem[],
  group: RepositoryListGroup,
  repository: Repository,
  sourceRepository: Repository,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
  groupNames: ReadonlyMap<string, number>,
  allNames: ReadonlyMap<string, number>,
  repositoryByPath: ReadonlyMap<string, Repository>,
  storedRepositoryPaths: ReadonlySet<string>,
  emittedVirtualPaths: Set<string>
): void {
  const repoState = localRepositoryStateLookup.get(repository.id)
  const allWorktrees = repoState?.worktrees ?? []
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
      buildRepositoryRow(
        group,
        virtualRepository,
        true,
        true,
        localRepositoryStateLookup,
        groupNames,
        allNames,
        repositoryByPath,
        {
          isVirtualLinkedWorktree: true,
          worktreePath: worktree.path,
          sourceRepository,
          branchName: getBranchNameForWorktree(worktree),
          changedFilesCount: 0,
          aheadBehind: null,
        }
      )
    )
    emittedVirtualPaths.add(virtualRepositoryPath)
  }
}

/**
 * Extracts pinned items from existing groups and returns a Pins group, or null
 * if none of the pinned IDs are found in the groups.
 */
export function buildPinnedGroup(
  pinnedIds: ReadonlyArray<number>,
  allGroups: ReadonlyArray<
    IFilterListGroup<IRepositoryListItem, RepositoryListGroup>
  >
): IFilterListGroup<IRepositoryListItem, RepositoryListGroup> | null {
  if (pinnedIds.length === 0) {
    return null
  }

  const idToItems = new Map<number, IRepositoryListItem[]>()
  const completedIds = new Set<number>()
  for (const group of allGroups) {
    for (const item of group.items) {
      const id = item.repository.id
      if (id <= 0 || completedIds.has(id)) {
        continue
      }
      const rows = idToItems.get(id)
      if (rows === undefined) {
        idToItems.set(id, [item])
      } else {
        rows.push(item)
      }
    }
    for (const id of idToItems.keys()) {
      completedIds.add(id)
    }
  }

  const items = pinnedIds.flatMap(id => idToItems.get(id) ?? [])

  if (items.length === 0) {
    return null
  }

  return { identifier: { kind: 'pins', displayName: null }, items }
}

/**
 * Returns groups with pinned items removed so they only appear in the Pins group.
 */
export function filterPinnedFromGroups(
  pinnedIds: ReadonlyArray<number>,
  groups: ReadonlyArray<
    IFilterListGroup<IRepositoryListItem, RepositoryListGroup>
  >
): ReadonlyArray<IFilterListGroup<IRepositoryListItem, RepositoryListGroup>> {
  if (pinnedIds.length === 0) {
    return groups
  }

  const pinnedIdSet = new Set(pinnedIds)
  return groups
    .map(group => ({
      ...group,
      items: group.items.filter(item => !pinnedIdSet.has(item.repository.id)),
    }))
    .filter(group => group.items.length > 0)
}
