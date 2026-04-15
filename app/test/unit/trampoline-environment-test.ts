import assert from 'node:assert'
import { describe, it } from 'node:test'

import { formatCredentialHelperPathForGitConfig } from '../../src/lib/trampoline/credential-helper-config'

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
})
