import {
  BundledGitSource,
  DefaultSshGitCommand,
  DefaultSshGitPath,
  type SshGitPathTranslation,
  type RepositoryGitSource,
  WslGitSource,
} from '../../models/repository-git-source'

export const WslGitRepositoryPrefix = '\\\\wsl.localhost\\Ubuntu\\'
const sshFsDrivePathRe = /^[x-z]:[\\/]/i

const normalizedWslPrefix = WslGitRepositoryPrefix.toLowerCase()
const normalizedForwardSlashWslPrefix = '//wsl.localhost/ubuntu/'

const trackedRepositoryGitSources = new Map<string, RepositoryGitSource>()

const normalizeRepositorySourceKey = (path: string) =>
  path
    .replace(/\//g, '\\')
    .replace(/[\\\/]+$/, '')
    .toLowerCase()

export function isWslRepositoryPath(path: string): boolean {
  return path.replace(/\//g, '\\').toLowerCase().startsWith(normalizedWslPrefix)
}

export function isSshFsRepositoryPath(path: string): boolean {
  return sshFsDrivePathRe.test(path)
}

function getDefaultRepositoryGitSource(path: string): RepositoryGitSource {
  return isWslRepositoryPath(path) ? WslGitSource : BundledGitSource
}

export function normalizeRepositoryGitSource(
  repositoryPath: string,
  gitSource: RepositoryGitSource | null | undefined
): RepositoryGitSource {
  if (gitSource?.kind === 'external') {
    return gitSource
  }

  if (gitSource?.kind === 'ssh') {
    const command = gitSource.command.trim()
    const gitPath = gitSource.gitPath?.trim() ?? ''
    const legacyPathTranslation = gitSource.useWslPathTranslation
      ? 'wsl'
      : 'none'
    const pathTranslation = gitSource.pathTranslation ?? legacyPathTranslation

    return {
      kind: 'ssh',
      command: command.length > 0 ? command : DefaultSshGitCommand,
      gitPath: gitPath.length > 0 ? gitPath : DefaultSshGitPath,
      useWslPathTranslation: pathTranslation !== 'none',
      pathTranslation,
    }
  }

  if (gitSource?.kind === 'wsl' && !isWslRepositoryPath(repositoryPath)) {
    return BundledGitSource
  }

  return gitSource ?? getDefaultRepositoryGitSource(repositoryPath)
}

export function setTrackedRepositoryGitSources(
  repositories: ReadonlyArray<{
    path: string
    gitSourceOverride: RepositoryGitSource
  }>
) {
  trackedRepositoryGitSources.clear()

  for (const repository of repositories) {
    trackedRepositoryGitSources.set(
      normalizeRepositorySourceKey(repository.path),
      normalizeRepositoryGitSource(
        repository.path,
        repository.gitSourceOverride
      )
    )
  }
}

export function setTrackedRepositoryGitSource(
  path: string,
  gitSourceOverride: RepositoryGitSource
) {
  trackedRepositoryGitSources.set(
    normalizeRepositorySourceKey(path),
    normalizeRepositoryGitSource(path, gitSourceOverride)
  )
}

export function deleteTrackedRepositoryGitSource(path: string) {
  trackedRepositoryGitSources.delete(normalizeRepositorySourceKey(path))
}

export function getTrackedRepositoryGitSource(path: string) {
  return trackedRepositoryGitSources.get(normalizeRepositorySourceKey(path))
}

export function getRepositoryGitSource(path: string): RepositoryGitSource {
  return (
    getTrackedRepositoryGitSource(path) ?? getDefaultRepositoryGitSource(path)
  )
}

export function isPosixGitSource(source: RepositoryGitSource): boolean {
  return source.kind === 'wsl' || source.kind === 'ssh'
}

export function toSshFsPath(path: string): string {
  if (path.length === 0) {
    return path
  }

  const driveMatch = /^[a-zA-Z]:[\\/](.*)$/.exec(path)
  if (driveMatch !== null) {
    const [, rest] = driveMatch
    const suffix = rest.replace(/\\/g, '/').replace(/^\/+/, '')
    return suffix.length > 0 ? `/${suffix}` : '/'
  }

  return path.replace(/\\/g, '/')
}

export function toRemotePosixPath(path: string): string {
  if (path.startsWith('\\') && !path.startsWith('\\\\')) {
    return path.replace(/\\/g, '/')
  }

  return path
}

export function translateSshGitPath(
  path: string,
  translation: SshGitPathTranslation
): string {
  switch (translation) {
    case 'wsl':
      return toWslPath(path)
    case 'sshfs':
      return toSshFsPath(path)
    case 'none':
      return path
  }
}

export function toWslPath(path: string): string {
  if (path.length === 0) {
    return path
  }

  if (isWslRepositoryPath(path)) {
    const suffix = path
      .replace(/\//g, '\\')
      .slice(WslGitRepositoryPrefix.length)
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')

    return `/${suffix}`
  }

  const driveMatch = /^([a-zA-Z]):[\\/](.*)$/.exec(path)
  if (driveMatch !== null) {
    const [, drive, rest] = driveMatch
    const normalized = rest.replace(/\\/g, '/')
    return `/mnt/${drive.toLowerCase()}/${normalized}`
  }

  return path.replace(/\\/g, '/')
}

export function fromWslPath(path: string): string {
  if (!path.startsWith('/')) {
    return path
  }

  const normalizedForwardSlashes = path.replace(/\\/g, '/')

  if (
    normalizedForwardSlashes.toLowerCase().startsWith('/wsl.localhost/ubuntu/')
  ) {
    return `\\\\${normalizedForwardSlashes.slice(1).replace(/\//g, '\\')}`
  }

  if (
    normalizedForwardSlashes
      .toLowerCase()
      .startsWith(normalizedForwardSlashWslPrefix)
  ) {
    return normalizedForwardSlashes.replace(/\//g, '\\')
  }

  const driveMatch = /^\/mnt\/([a-zA-Z])(?:\/(.*))?$/.exec(path)
  if (driveMatch !== null) {
    const [, drive, rest = ''] = driveMatch
    const suffix = rest.replace(/\//g, '\\')
    return `${drive.toUpperCase()}:\\${suffix}`
  }

  const suffix = normalizedForwardSlashes
    .replace(/^\/+/, '')
    .replace(/\//g, '\\')
  return `${WslGitRepositoryPrefix}${suffix}`
}

export function translateWslPathValue(path: string | null | undefined) {
  if (path === null || path === undefined || !path.startsWith('/')) {
    return path
  }

  return fromWslPath(path)
}
