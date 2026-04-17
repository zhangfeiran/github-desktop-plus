import assert from 'node:assert'
import { describe, it } from 'node:test'
import type { ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'

import type { IGitExecutionOptions } from '../../../src/lib/git/core'
import { executionOptionsWithProgress } from '../../../src/lib/progress/from-process'
import { IGitProgressParser } from '../../../src/lib/progress/git'

describe('progress/from-process', () => {
  it('coerces Buffer line chunks before parsing Git progress', async () => {
    const stderr = new PassThrough()
    const process = Object.assign(new EventEmitter(), {
      stderr,
      stdout: null,
    }) as unknown as ChildProcess
    const parser: IGitProgressParser = {
      parse: line => {
        assert.equal(typeof line, 'string')
        return { kind: 'context', text: line, percent: 0 }
      },
    }
    const baseOptions: IGitExecutionOptions = {}

    const progress = new Promise<void>(resolve => {
      void executionOptionsWithProgress(baseOptions, parser, result => {
        assert.deepEqual(result, {
          kind: 'context',
          text: 'remote: Counting objects:  50% (1/2)',
          percent: 0,
        })
        resolve()
      }).then(options => {
        options.processCallback?.(process)
        stderr.write(Buffer.from('remote: Counting objects:  50% (1/2)\n'))
      })
    })

    await progress
  })
})
