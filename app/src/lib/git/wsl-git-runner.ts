import { spawn, type ChildProcess, type ExecFileOptions } from 'child_process'
import { randomBytes } from 'crypto'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { ExecError, type IGitResult } from 'dugite'

type WslGitExecutionOptions = {
  readonly args: ReadonlyArray<string>
  readonly cwd: string
  readonly env: ReadonlyArray<string>
  readonly processEnv: NodeJS.ProcessEnv
  readonly stdin?: string | Buffer
  readonly stdinEncoding?: BufferEncoding
  readonly encoding: BufferEncoding | 'buffer'
  readonly maxBuffer: number
  readonly signal?: AbortSignal
  readonly killSignal?: ExecFileOptions['killSignal']
  readonly processCallback?: (process: ChildProcess) => void
}

type WslGitCommandScriptOptions = {
  readonly id: string
  readonly args: ReadonlyArray<string>
  readonly cwd: string
  readonly env: ReadonlyArray<string>
  readonly stdin?: Buffer
}

type ActiveRequest = {
  readonly id: string
  readonly stdoutMarker: Buffer
  readonly stderrMarkerPrefix: Buffer
  readonly stderrMarkerSuffix: Buffer
  readonly script: string
  readonly encoding: BufferEncoding | 'buffer'
  readonly maxBuffer: number
  readonly proxy: WslGitProcess
  readonly stdoutChunks: Buffer[]
  readonly stderrChunks: Buffer[]
  readonly resolve: (result: IGitResult) => void
  readonly reject: (error: Error) => void
  removeAbortListener: () => void
  stdoutPending: Buffer
  stderrPending: Buffer
  stdoutLength: number
  stderrLength: number
  stdoutDone: boolean
  stderrDone: boolean
  exitCode: number | null
  settled: boolean
}

type QueuedRequest = {
  readonly options: WslGitExecutionOptions
  readonly active: ActiveRequest
}

const controlByte = '\x1e'
const wslGitMarkerPrefix = `${controlByte}GDP_WSL_GIT`

const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`

const markerPattern = (name: string, id: string) =>
  `${wslGitMarkerPrefix}_${name}_${id}${controlByte}`

const stderrMarkerPattern = (id: string) =>
  `${wslGitMarkerPrefix}_STDERR_END_${id}:%03d${controlByte}`

const createMaxBufferError = (
  streamName: 'stdout' | 'stderr',
  stdout: Buffer,
  stderr: Buffer
) => {
  const cause = new Error(
    `${streamName} maxBuffer length exceeded`
  ) as Error & {
    code: string
    killed: boolean
  }
  cause.code = 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
  cause.killed = true

  return new ExecError(cause.message, stdout, stderr, cause)
}

const createAbortError = (stdout: Buffer, stderr: Buffer) => {
  const cause = new Error('The operation was aborted') as Error & {
    code: string
    killed: boolean
  }
  cause.name = 'AbortError'
  cause.code = 'ABORT_ERR'
  cause.killed = true

  return new ExecError(cause.message, stdout, stderr, cause)
}

export const createWslGitCommandScript = ({
  id,
  args,
  cwd,
  env,
  stdin,
}: WslGitCommandScriptOptions) => {
  const stdinVariableName = `__gdp_wsl_git_stdin_${id}`
  const stdinDelimiter = `__GDP_WSL_GIT_STDIN_${id}__`
  const stdinSetup =
    stdin === undefined
      ? ''
      : [
          `${stdinVariableName}=$(mktemp)`,
          `base64 -d > "$${stdinVariableName}" <<'${stdinDelimiter}'`,
          stdin.toString('base64'),
          stdinDelimiter,
        ].join('\n') + '\n'
  const stdinRedirect =
    stdin === undefined ? '< /dev/null' : `< "$${stdinVariableName}"`
  const stdinCleanup =
    stdin === undefined ? '' : `rm -f "$${stdinVariableName}"\n`
  const envArgs = env.map(shellQuote)
  const gitCommand = ['env', ...envArgs, 'git', ...args.map(shellQuote)].join(
    ' '
  )

  return [
    stdinSetup,
    `if cd -- ${shellQuote(cwd)}; then`,
    `  ${gitCommand} ${stdinRedirect}`,
    '  __gdp_wsl_git_status=$?',
    'else',
    '  __gdp_wsl_git_status=$?',
    'fi',
    stdinCleanup,
    `printf ${shellQuote(markerPattern('STDOUT_END', id))}`,
    `printf ${shellQuote(stderrMarkerPattern(id))} "$__gdp_wsl_git_status" >&2`,
    '',
  ].join('\n')
}

class WslGitProcess extends EventEmitter {
  public readonly stdout = new PassThrough()
  public readonly stderr = new PassThrough()
  public readonly stdin = new PassThrough()
  public killed = false
  public exitCode: number | null = null
  public signalCode: NodeJS.Signals | null = null

  public constructor(
    private readonly onKill: (signal?: NodeJS.Signals | number) => boolean,
    encoding: BufferEncoding | 'buffer'
  ) {
    super()

    if (encoding !== 'buffer') {
      this.stdout.setEncoding(encoding)
      this.stderr.setEncoding(encoding)
    }
  }

  public kill(signal?: NodeJS.Signals | number) {
    this.killed = true
    return this.onKill(signal)
  }

  public close(exitCode: number, signalCode: NodeJS.Signals | null = null) {
    this.exitCode = exitCode
    this.signalCode = signalCode
    this.stdin.end()
    this.stdout.end()
    this.stderr.end()
    this.emit('exit', exitCode, signalCode)
    this.emit('close', exitCode, signalCode)
  }
}

class WslGitRunner {
  private child: ChildProcess | null = null
  private readonly queue = new Array<QueuedRequest>()
  private activeRequest: ActiveRequest | null = null

  public shutdown() {
    const child = this.child
    const active = this.activeRequest
    const queued = this.queue.splice(0)

    this.child = null
    this.activeRequest = null

    if (active !== null) {
      this.rejectRequest(active, createAbortError)
    }

    for (const request of queued) {
      this.rejectRequest(request.active, createAbortError)
    }

    child?.kill()
  }

  public exec(options: WslGitExecutionOptions): Promise<IGitResult> {
    return new Promise((resolve, reject) => {
      const id = randomBytes(16).toString('hex')
      const stdoutMarker = Buffer.from(markerPattern('STDOUT_END', id))
      const stderrMarkerPrefix = Buffer.from(
        `${wslGitMarkerPrefix}_STDERR_END_${id}:`
      )
      const stderrMarkerSuffix = Buffer.from(controlByte)
      const stdin =
        options.stdin === undefined
          ? undefined
          : Buffer.isBuffer(options.stdin)
          ? options.stdin
          : Buffer.from(options.stdin, options.stdinEncoding ?? 'utf8')
      let active: ActiveRequest
      const proxy = new WslGitProcess(
        signal => this.killActiveRequest(active, signal),
        options.encoding
      )
      active = {
        id,
        stdoutMarker,
        stderrMarkerPrefix,
        stderrMarkerSuffix,
        script: createWslGitCommandScript({
          id,
          args: options.args,
          cwd: options.cwd,
          env: options.env,
          stdin,
        }),
        encoding: options.encoding,
        maxBuffer: options.maxBuffer,
        proxy,
        stdoutChunks: [],
        stderrChunks: [],
        resolve,
        reject,
        removeAbortListener: () => {},
        stdoutPending: Buffer.alloc(0),
        stderrPending: Buffer.alloc(0),
        stdoutLength: 0,
        stderrLength: 0,
        stdoutDone: false,
        stderrDone: false,
        exitCode: null,
        settled: false,
      }

      const abort = () => {
        if (this.activeRequest === active) {
          this.rejectActiveRequest(createAbortError, true, options.killSignal)
        } else {
          this.removeQueuedRequest(active)
          this.rejectRequest(active, createAbortError)
        }
      }

      if (options.signal?.aborted === true) {
        this.rejectRequest(active, createAbortError)
        return
      }

      options.signal?.addEventListener('abort', abort, { once: true })
      active.removeAbortListener = () =>
        options.signal?.removeEventListener('abort', abort)

      options.processCallback?.(proxy as unknown as ChildProcess)
      this.queue.push({ options, active })
      this.runNext()
    })
  }

  private runNext() {
    if (this.activeRequest !== null) {
      return
    }

    const next = this.queue.shift()
    if (next === undefined) {
      return
    }

    this.activeRequest = next.active

    const child = this.ensureChild(next.options.processEnv)
    if (child.stdin === null) {
      this.rejectActiveRequest(
        (stdout, stderr) =>
          new ExecError(
            'WSL Git runner stdin is not available',
            stdout,
            stderr
          ),
        true
      )
      return
    }

    child.stdin.write(next.active.script, err => {
      if (err) {
        this.rejectActiveRequest(
          (stdout, stderr) => new ExecError(err.message, stdout, stderr, err),
          true
        )
      }
    })
  }

  private ensureChild(processEnv: NodeJS.ProcessEnv) {
    if (this.child !== null && this.child.stdin?.writable === true) {
      return this.child
    }

    const child = spawn(
      'wsl.exe',
      ['--exec', 'bash', '--noprofile', '--norc'],
      {
        cwd: process.cwd(),
        env: processEnv,
      }
    )

    child.stdout?.on('data', chunk => {
      if (this.child === child) {
        this.onStdoutData(chunk)
      }
    })
    child.stderr?.on('data', chunk => {
      if (this.child === child) {
        this.onStderrData(chunk)
      }
    })
    child.on('error', err => {
      if (this.child !== child) {
        return
      }

      this.rejectActiveRequest(
        (stdout, stderr) => new ExecError(err.message, stdout, stderr, err),
        true
      )
    })
    child.on('close', (code, signal) => {
      if (this.child !== child) {
        return
      }

      this.child = null

      if (this.activeRequest !== null) {
        this.rejectActiveRequest(
          (stdout, stderr) =>
            new ExecError(
              `WSL Git runner exited with code ${code ?? 'null'} and signal ${
                signal ?? 'null'
              }`,
              stdout,
              stderr,
              { code: code?.toString(), signal: signal ?? undefined }
            ),
          false
        )
      }

      this.runNext()
    })

    this.child = child
    return child
  }

  private onStdoutData(chunk: Buffer) {
    const active = this.activeRequest
    if (active === null) {
      return
    }

    const pending = Buffer.concat([active.stdoutPending, chunk])
    const markerIndex = pending.indexOf(active.stdoutMarker)

    if (markerIndex === -1) {
      active.stdoutPending = this.pushMaybePartialMarker(
        active,
        'stdout',
        pending,
        active.stdoutMarker.length
      )
      return
    }

    this.pushOutput(active, 'stdout', pending.subarray(0, markerIndex))
    active.stdoutPending = Buffer.alloc(0)
    active.stdoutDone = true
    this.maybeResolveActiveRequest()
  }

  private onStderrData(chunk: Buffer) {
    const active = this.activeRequest
    if (active === null) {
      return
    }

    const pending = Buffer.concat([active.stderrPending, chunk])
    const prefixIndex = pending.indexOf(active.stderrMarkerPrefix)

    if (prefixIndex === -1) {
      active.stderrPending = this.pushMaybePartialMarker(
        active,
        'stderr',
        pending,
        active.stderrMarkerPrefix.length
      )
      return
    }

    const statusStart = prefixIndex + active.stderrMarkerPrefix.length
    const suffixIndex = pending.indexOf(active.stderrMarkerSuffix, statusStart)
    if (suffixIndex === -1) {
      active.stderrPending = pending
      return
    }

    this.pushOutput(active, 'stderr', pending.subarray(0, prefixIndex))

    const status = pending.subarray(statusStart, suffixIndex).toString('utf8')
    const exitCode = Number(status)
    active.exitCode = Number.isFinite(exitCode) ? exitCode : 1
    active.stderrPending = Buffer.alloc(0)
    active.stderrDone = true
    this.maybeResolveActiveRequest()
  }

  private pushMaybePartialMarker(
    active: ActiveRequest,
    streamName: 'stdout' | 'stderr',
    pending: Buffer,
    markerLength: number
  ) {
    const retainedLength = Math.min(
      pending.length,
      Math.max(markerLength - 1, 0)
    )
    const outputLength = pending.length - retainedLength

    if (outputLength > 0) {
      this.pushOutput(active, streamName, pending.subarray(0, outputLength))
    }

    return pending.subarray(outputLength)
  }

  private pushOutput(
    active: ActiveRequest,
    streamName: 'stdout' | 'stderr',
    chunk: Buffer
  ) {
    if (chunk.length === 0 || active.settled) {
      return
    }

    const chunks =
      streamName === 'stdout' ? active.stdoutChunks : active.stderrChunks
    chunks.push(chunk)

    if (streamName === 'stdout') {
      active.stdoutLength += chunk.length
    } else {
      active.stderrLength += chunk.length
    }

    const byteLength =
      streamName === 'stdout' ? active.stdoutLength : active.stderrLength

    if (byteLength > active.maxBuffer) {
      this.rejectActiveRequest(
        (stdout, stderr) => createMaxBufferError(streamName, stdout, stderr),
        true
      )
      return
    }

    if (streamName === 'stdout') {
      active.proxy.stdout.write(chunk)
    } else {
      active.proxy.stderr.write(chunk)
    }
  }

  private maybeResolveActiveRequest() {
    const active = this.activeRequest
    if (
      active === null ||
      active.settled ||
      !active.stdoutDone ||
      !active.stderrDone ||
      active.exitCode === null
    ) {
      return
    }

    active.settled = true
    active.removeAbortListener()

    const stdout = Buffer.concat(active.stdoutChunks)
    const stderr = Buffer.concat(active.stderrChunks)
    const result = {
      stdout:
        active.encoding === 'buffer'
          ? stdout
          : stdout.toString(active.encoding),
      stderr:
        active.encoding === 'buffer'
          ? stderr
          : stderr.toString(active.encoding),
      exitCode: active.exitCode,
    }

    active.proxy.close(active.exitCode)
    active.resolve(result)
    this.activeRequest = null
    this.runNext()
  }

  private killActiveRequest(
    active: ActiveRequest,
    signal?: NodeJS.Signals | number
  ) {
    if (this.activeRequest !== active || this.child === null) {
      return false
    }

    return this.child.kill(signal)
  }

  private removeQueuedRequest(active: ActiveRequest) {
    const index = this.queue.findIndex(x => x.active === active)
    if (index >= 0) {
      this.queue.splice(index, 1)
    }
  }

  private rejectActiveRequest(
    createError: (stdout: Buffer, stderr: Buffer) => Error,
    killChild: boolean,
    killSignal?: NodeJS.Signals | number
  ) {
    const active = this.activeRequest
    if (active === null) {
      return
    }

    this.rejectRequest(active, createError)
    this.activeRequest = null

    if (killChild) {
      this.child?.kill(killSignal)
      this.child = null
    }

    this.runNext()
  }

  private rejectRequest(
    active: ActiveRequest,
    createError: (stdout: Buffer, stderr: Buffer) => Error
  ) {
    if (active.settled) {
      return
    }

    active.settled = true
    active.removeAbortListener()

    const stdout = Buffer.concat([...active.stdoutChunks, active.stdoutPending])
    const stderr = Buffer.concat([...active.stderrChunks, active.stderrPending])
    const error = createError(stdout, stderr)

    active.proxy.close(active.exitCode ?? 1)
    active.reject(error)
  }
}

let runner: WslGitRunner | null = null

const getRunner = () => {
  if (runner === null) {
    runner = new WslGitRunner()
  }

  return runner
}

export const execWslGitProcess = (options: WslGitExecutionOptions) =>
  getRunner().exec(options)

export const shutdownWslGitRunner = () => {
  runner?.shutdown()
  runner = null
}
