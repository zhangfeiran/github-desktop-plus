export type SshGitPathTranslation = 'wsl' | 'sshfs' | 'none'

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
  | {
      readonly kind: 'ssh'
      readonly command: string
      readonly useWslPathTranslation: boolean
      readonly pathTranslation: SshGitPathTranslation
    }

export type SshGitSource = Extract<RepositoryGitSource, { kind: 'ssh' }>

export const BundledGitSource: RepositoryGitSource = {
  kind: 'bundled',
}

export const WslGitSource: RepositoryGitSource = {
  kind: 'wsl',
}

export const DefaultSshGitCommand = 'ssh frz@127.0.0.1 -p 20022'

export const DefaultSshGitSource: SshGitSource = {
  kind: 'ssh',
  command: DefaultSshGitCommand,
  useWslPathTranslation: true,
  pathTranslation: 'wsl',
}

export function repositoryGitSourcesEqual(
  a: RepositoryGitSource,
  b: RepositoryGitSource
) {
  return (
    a.kind === b.kind &&
    (a.kind !== 'external' || b.kind !== 'external' || a.path === b.path) &&
    (a.kind !== 'ssh' ||
      b.kind !== 'ssh' ||
      (a.command === b.command &&
        a.useWslPathTranslation === b.useWslPathTranslation &&
        a.pathTranslation === b.pathTranslation))
  )
}
