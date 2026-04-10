import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import {
  fromWslPath,
  getRepositoryGitSource,
  isWslRepositoryPath,
  normalizeRepositoryGitSource,
  setTrackedRepositoryGitSources,
  toWslPath,
} from '../../src/lib/git/source'

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

  it('translates between Windows and WSL paths', () => {
    assert.equal(
      toWslPath('\\\\wsl.localhost\\Ubuntu\\home\\feiran\\repo'),
      '/home/feiran/repo'
    )
    assert.equal(
      toWslPath('E:\\Documents\\GitHub\\github-desktop-plus'),
      '/mnt/e/Documents/GitHub/github-desktop-plus'
    )
    assert.equal(fromWslPath('/home/feiran/repo'), '\\\\wsl.localhost\\Ubuntu\\home\\feiran\\repo')
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
