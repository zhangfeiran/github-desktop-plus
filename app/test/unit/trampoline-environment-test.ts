import assert from 'node:assert'
import { describe, it } from 'node:test'

import { formatCredentialHelperPathForGitConfig } from '../../src/lib/trampoline/credential-helper-config'
import { createTrampolineEnvironment } from '../../src/lib/trampoline/trampoline-environment'

describe('trampoline/environment', () => {
  it('formats Windows credential helper paths as shell-safe Git config values', () => {
    assert.equal(
      formatCredentialHelperPathForGitConfig(
        'C:\\Users\\Feiran Zhang\\GitHubDesktopPlus\\helper.exe'
      ),
      '!"C:/Users/Feiran Zhang/GitHubDesktopPlus/helper.exe"'
    )
  })

  it('escapes shell metacharacters inside quoted helper paths', () => {
    assert.equal(
      formatCredentialHelperPathForGitConfig('/tmp/GitHub "Desktop"/helper'),
      '!"/tmp/GitHub \\"Desktop\\"/helper"'
    )
  })

  it('omits Desktop credential helpers for SSH Git sources', () => {
    const env = createTrampolineEnvironment(
      'token',
      12345,
      'git/2.0',
      "'protocol.version=2'",
      {
        GIT_SSH: '/tmp/ssh-wrapper',
      },
      false
    )

    assert.deepEqual(env, { GIT_USER_AGENT: 'git/2.0' })
  })

  it('injects Desktop credential helpers for local Git sources', () => {
    const env = createTrampolineEnvironment(
      'token',
      12345,
      'git/2.0',
      "'protocol.version=2'",
      {
        GIT_SSH: '/tmp/ssh-wrapper',
      },
      true
    )

    assert.equal(env.DESKTOP_PORT, '12345')
    assert.equal(env.DESKTOP_TRAMPOLINE_TOKEN, 'token')
    assert.equal(env.GIT_ASKPASS, '')
    assert.equal(env.GIT_SSH, '/tmp/ssh-wrapper')
    assert.equal(env.GIT_USER_AGENT, 'git/2.0')
    assert.match(
      env.GIT_CONFIG_PARAMETERS ?? '',
      /^'protocol\.version=2' 'credential\.helper=' 'credential\.helper=!/
    )
  })
})
