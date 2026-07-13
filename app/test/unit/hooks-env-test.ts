import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'

import { withHooksEnv } from '../../src/lib/hooks/with-hooks-env'
import { setTrackedRepositoryGitSources } from '../../src/lib/git/source'
import { DefaultSshGitPath } from '../../src/models/repository-git-source'

describe('hooks/with-hooks-env', () => {
  afterEach(() => {
    setTrackedRepositoryGitSources([])
  })

  it('does not override remote hooks for SSH Git sources', async () => {
    const path = 'X:\\home\\feiran\\repo'
    const env = { GIT_TERMINAL_PROMPT: '0' }

    setTrackedRepositoryGitSources([
      {
        path,
        gitSourceOverride: {
          kind: 'ssh',
          command: 'ssh feiran@8.92.7.129',
          gitPath: DefaultSshGitPath,
          useWslPathTranslation: true,
          pathTranslation: 'sshfs',
          sshFsDrive: 'X',
        },
      },
    ])

    const result = await withHooksEnv(async hooksEnv => hooksEnv, path, {
      env,
      interceptHooks: ['pre-push'],
    })

    assert.deepEqual(result, env)
  })
})
