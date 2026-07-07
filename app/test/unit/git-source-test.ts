import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import {
  fromWslPath,
  getRepositoryGitSource,
  isSshFsRepositoryPath,
  isWslRepositoryPath,
  normalizeRepositoryGitSource,
  setTrackedRepositoryGitSources,
  toSshFsPath,
  toRemotePosixPath,
  toWslPath,
} from '../../src/lib/git/source'
import {
  DefaultSshGitCommand,
  DefaultSshGitPath,
  DefaultSshGitSource,
  repositoryGitSourcesEqual,
} from '../../src/models/repository-git-source'

describe('git/source', () => {
  afterEach(() => {
    setTrackedRepositoryGitSources([])
  })

  it('only treats Ubuntu wsl.localhost paths as WSL repositories', () => {
    assert.equal(
      isWslRepositoryPath('\\\\wsl.localhost\\Ubuntu\\home\\feiran\\repo'),
      true
    )
    assert.equal(
      isWslRepositoryPath('\\\\wsl.localhost\\Debian\\home\\feiran\\repo'),
      false
    )
    assert.equal(isWslRepositoryPath('E:\\repo'), false)
  })

  it('falls back to bundled Git when WSL is selected for a Windows path', () => {
    assert.deepEqual(
      normalizeRepositoryGitSource('E:\\repo', { kind: 'wsl' }),
      { kind: 'bundled' }
    )
  })

  it('defaults untracked WSL repositories to WSL Git', () => {
    assert.deepEqual(
      getRepositoryGitSource('\\\\wsl.localhost\\Ubuntu\\home\\feiran\\repo'),
      { kind: 'wsl' }
    )
  })

  it('defaults missing WSL repository source overrides to WSL Git', () => {
    assert.deepEqual(
      normalizeRepositoryGitSource(
        '\\\\wsl.localhost\\Ubuntu\\home\\feiran\\repo',
        null
      ),
      { kind: 'wsl' }
    )
  })

  it('prefers tracked repository overrides over path defaults', () => {
    setTrackedRepositoryGitSources([
      {
        path: '\\\\wsl.localhost\\Ubuntu\\home\\feiran\\repo',
        gitSourceOverride: {
          kind: 'external',
          path: 'C:\\Program Files\\Git\\cmd\\git.exe',
        },
      },
    ])

    assert.deepEqual(
      getRepositoryGitSource('\\\\wsl.localhost\\Ubuntu\\home\\feiran\\repo'),
      {
        kind: 'external',
        path: 'C:\\Program Files\\Git\\cmd\\git.exe',
      }
    )
  })

  it('normalizes SSH Git sources without restricting them to WSL paths', () => {
    assert.deepEqual(
      normalizeRepositoryGitSource('E:\\repo', {
        kind: 'ssh',
        command: '  ssh frz@127.0.0.1 -p 20022  ',
        gitPath: '  ~/miniforge3/bin/git  ',
        useWslPathTranslation: true,
        pathTranslation: 'wsl',
      }),
      {
        kind: 'ssh',
        command: 'ssh frz@127.0.0.1 -p 20022',
        gitPath: '~/miniforge3/bin/git',
        useWslPathTranslation: true,
        pathTranslation: 'wsl',
      }
    )

    assert.deepEqual(
      normalizeRepositoryGitSource('E:\\repo', {
        kind: 'ssh',
        command: '',
        gitPath: '',
        useWslPathTranslation: true,
        pathTranslation: 'wsl',
      }),
      DefaultSshGitSource
    )
  })

  it('normalizes SSHFS Git source path translation', () => {
    assert.deepEqual(
      normalizeRepositoryGitSource('X:\\home\\feiran\\repo', {
        kind: 'ssh',
        command: 'ssh feiran@8.92.7.129',
        gitPath: DefaultSshGitPath,
        useWslPathTranslation: true,
        pathTranslation: 'sshfs',
      }),
      {
        kind: 'ssh',
        command: 'ssh feiran@8.92.7.129',
        gitPath: DefaultSshGitPath,
        useWslPathTranslation: true,
        pathTranslation: 'sshfs',
      }
    )
  })

  it('compares SSH Git source settings by command and path translation', () => {
    assert.equal(
      repositoryGitSourcesEqual(
        {
          kind: 'ssh',
          command: DefaultSshGitCommand,
          gitPath: DefaultSshGitPath,
          useWslPathTranslation: true,
          pathTranslation: 'wsl',
        },
        DefaultSshGitSource
      ),
      true
    )
    assert.equal(
      repositoryGitSourcesEqual(
        {
          kind: 'ssh',
          command: DefaultSshGitCommand,
          gitPath: DefaultSshGitPath,
          useWslPathTranslation: true,
          pathTranslation: 'wsl',
        },
        {
          kind: 'ssh',
          command: DefaultSshGitCommand,
          gitPath: DefaultSshGitPath,
          useWslPathTranslation: false,
          pathTranslation: 'none',
        }
      ),
      false
    )
  })

  it('detects SSHFS drive paths and translates them to remote paths', () => {
    assert.equal(isSshFsRepositoryPath('X:\\home\\feiran\\repo'), true)
    assert.equal(isSshFsRepositoryPath('Y:/home/feiran/repo'), true)
    assert.equal(isSshFsRepositoryPath('E:\\repo'), false)
    assert.equal(toSshFsPath('X:\\home\\feiran\\repo'), '/home/feiran/repo')
    assert.equal(toSshFsPath('Z:\\'), '/')
    assert.equal(toRemotePosixPath('\\home\\feiran\\repo'), '/home/feiran/repo')
    assert.equal(
      toRemotePosixPath('X:\\home\\feiran\\repo'),
      'X:\\home\\feiran\\repo'
    )
  })

  it('translates between Windows and WSL paths', () => {
    assert.equal(
      toWslPath('\\\\wsl.localhost\\Ubuntu\\home\\feiran\\repo'),
      '/home/feiran/repo'
    )
    assert.equal(
      toWslPath('E:\\Documents\\GitHub\\github-desktop-plus'),
      '/mnt/e/Documents/GitHub/github-desktop-plus'
    )
    assert.equal(
      fromWslPath('/home/feiran/repo'),
      '\\\\wsl.localhost\\Ubuntu\\home\\feiran\\repo'
    )
    assert.equal(
      fromWslPath('/mnt/e/Documents/GitHub/github-desktop-plus'),
      'E:\\Documents\\GitHub\\github-desktop-plus'
    )
  })

  it('does not duplicate the UNC prefix when translating pseudo-UNC WSL paths', () => {
    assert.equal(
      fromWslPath('/wsl.localhost/Ubuntu/home/frz/mindspore-cli'),
      '\\\\wsl.localhost\\Ubuntu\\home\\frz\\mindspore-cli'
    )
    assert.equal(
      fromWslPath('//wsl.localhost/Ubuntu/home/frz/mindspore-cli'),
      '\\\\wsl.localhost\\Ubuntu\\home\\frz\\mindspore-cli'
    )
  })
})
