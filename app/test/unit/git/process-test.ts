import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  translateWslEnv,
  translateWslGitConfigParameters,
} from '../../../src/lib/git/process'
import {
  createSshGitSpawnScript,
  getSshGitCommandArgs,
} from '../../../src/lib/git/ssh-git-runner'
import { createWslGitCommandScript } from '../../../src/lib/git/wsl-git-runner'

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

  it('adds trampoline variables to WSLENV for Windows helpers launched by WSL Git', () => {
    assert.deepEqual(
      translateWslEnv({
        DESKTOP_PORT: '12345',
        DESKTOP_TRAMPOLINE_TOKEN: 'abc',
        WSLENV: '',
      }),
      [
        'DESKTOP_PORT=12345',
        'DESKTOP_TRAMPOLINE_TOKEN=abc',
        'WSLENV=DESKTOP_PORT:DESKTOP_TRAMPOLINE_TOKEN',
      ]
    )
  })

  it('preserves existing WSLENV entries without duplicating trampoline variables', () => {
    assert.deepEqual(
      translateWslEnv({
        DESKTOP_PORT: '12345',
        DESKTOP_TRAMPOLINE_TOKEN: 'abc',
        WSLENV: 'PATH/l:DESKTOP_PORT:FOO/u',
      }),
      [
        'DESKTOP_PORT=12345',
        'DESKTOP_TRAMPOLINE_TOKEN=abc',
        'WSLENV=PATH/l:DESKTOP_PORT:FOO/u:DESKTOP_TRAMPOLINE_TOKEN',
      ]
    )
  })

  it('quotes persistent WSL Git runner commands and embeds stdin safely', () => {
    const script = createWslGitCommandScript({
      id: 'abc123',
      args: ['status', '--porcelain=v2', "quote's"],
      cwd: "/home/me/repo's",
      env: [`GIT_CONFIG_PARAMETERS='credential.helper=!"/mnt/e/helper.exe"'`],
      stdin: Buffer.from('input for git'),
    })

    assert.match(script, /base64 -d/)
    assert.ok(script.includes(Buffer.from('input for git').toString('base64')))
    assert.ok(script.includes(`cd -- '/home/me/repo'\\''s'`))
    assert.ok(script.includes(`'quote'\\''s'`))
    assert.ok(script.includes('GDP_WSL_GIT_STDOUT_END_abc123'))
    assert.ok(script.includes('GDP_WSL_GIT_STDERR_END_abc123:%03d'))
  })

  it('normalizes SSH Git command port options written after the destination', () => {
    assert.deepEqual(getSshGitCommandArgs('ssh frz@127.0.0.1 -p 20022'), [
      'ssh',
      '-p',
      '20022',
      'frz@127.0.0.1',
    ])
  })

  it('quotes SSH Git spawn commands', () => {
    const script = createSshGitSpawnScript({
      args: ['status', '--porcelain=v2', "quote's"],
      cwd: "/home/me/repo's",
      env: [`GIT_CONFIG_PARAMETERS='credential.helper=!"/mnt/e/helper.exe"'`],
      gitPath: '~/miniforge3/bin/git',
    })

    assert.ok(script.includes(`cd -- '/home/me/repo'\\''s'`))
    assert.ok(script.includes(`"$HOME"/'miniforge3/bin/git'`))
    assert.ok(script.includes(`'quote'\\''s'`))
    assert.ok(script.includes('< /dev/null'))
  })
})
