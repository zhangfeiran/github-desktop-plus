import assert from 'node:assert'
import { describe, it } from 'node:test'

import { translateWslGitConfigParameters } from '../../../src/lib/git/process'

describe('git/process', () => {
  it('translates quoted Windows Git config parameter paths for WSL', () => {
    assert.equal(
      translateWslGitConfigParameters(
        `'credential.helper=' 'credential.helper=!"E:/Documents/GitHub Desktop Plus/helper.exe"'`
      ),
      `'credential.helper=' 'credential.helper=!"/mnt/e/Documents/GitHub Desktop Plus/helper.exe"'`
    )
  })

  it('translates quoted backslash Windows Git config parameter paths for WSL', () => {
    assert.equal(
      translateWslGitConfigParameters(
        `'credential.helper=!"E:\\Documents\\GitHub Desktop Plus\\helper.exe"'`
      ),
      `'credential.helper=!"/mnt/e/Documents/GitHub Desktop Plus/helper.exe"'`
    )
  })
})
