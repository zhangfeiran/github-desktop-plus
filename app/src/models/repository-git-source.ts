export type RepositoryGitSource =
  | {
      readonly kind: 'bundled'
    }
  | {
      readonly kind: 'external'
      readonly path: string
    }
  | {
      readonly kind: 'wsl'
    }

export const BundledGitSource: RepositoryGitSource = {
  kind: 'bundled',
}

export const WslGitSource: RepositoryGitSource = {
  kind: 'wsl',
}

export function repositoryGitSourcesEqual(
  a: RepositoryGitSource,
  b: RepositoryGitSource
) {
  return (
    a.kind === b.kind &&
    (a.kind !== 'external' || b.kind !== 'external' || a.path === b.path)
  )
}
