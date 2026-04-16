import {
  execFile,
  spawn,
  type ChildProcess,
  type ChildProcessWithoutNullStreams,
} from 'child_process'
import {
  ExecError,
  ignoreClosedInputStream,
  type IGitExecutionOptions as DugiteExecutionOptions,
  type IGitResult,
  type IGitStringExecutionOptions,
  type IGitStringResult,
  type IGitBufferExecutionOptions,
  type IGitBufferResult,
  type IGitSpawnOptions,
  setupEnvironment,
} from 'dugite'
import type { RepositoryGitSource } from '../../models/repository-git-source'
import { getRepositoryGitSource, toWslPath } from './source'
import { execWslGitProcess } from './wsl-git-runner'

type GitCommand = {
  readonly command: string
  readonly args: ReadonlyArray<string>
  readonly cwd: string
  readonly env: Record<string, string | undefined>
  readonly source: RepositoryGitSource
  readonly wsl?: {
    readonly args: ReadonlyArray<string>
    readonly cwd: string
    readonly env: ReadonlyArray<string>
  }
}

const bundledGitEnvironmentKeys = new Set([
  'LOCAL_GIT_DIRECTORY',
  'GIT_EXEC_PATH',
  'GIT_TEMPLATE_DIR',
  'GIT_CONFIG_SYSTEM',
  'PREFIX',
])

const wslInteropEnvKeys = ['DESKTOP_PORT', 'DESKTOP_TRAMPOLINE_TOKEN']

const windowsDrivePathRe = /^[a-zA-Z]:[\\/]/
const wslRepositoryPathRe = /^(?:\\\\|\/\/)wsl\.localhost[\\/]Ubuntu[\\/]/i
const quotedWindowsDrivePathRe = /^"([a-zA-Z]:[\\/].*)"$/i
const quotedWslRepositoryPathRe =
  /^"((?:\\\\|\/\/)wsl\.localhost[\\/]Ubuntu[\\/].*)"$/i

const isWindowsAbsolutePath = (value: string) =>
  windowsDrivePathRe.test(value) || wslRepositoryPathRe.test(value)

const sanitizeWindowsGitEnv = (
  env: Record<string, string | undefined>
): Record<string, string | undefined> => {
  const sanitized = { ...process.env, ...env }

  for (const key of bundledGitEnvironmentKeys) {
    delete sanitized[key]
  }

  return sanitized
}

const translateWslPathArgument = (value: string): string => {
  if (isWindowsAbsolutePath(value)) {
    return toWslPath(value)
  }

  return value
}

const translateQuotedWslPathArgument = (value: string): string => {
  const quotedWindowsPath = quotedWindowsDrivePathRe.exec(value)
  if (quotedWindowsPath !== null) {
    return `"${toWslPath(quotedWindowsPath[1])}"`
  }

  const quotedRepositoryPath = quotedWslRepositoryPathRe.exec(value)
  if (quotedRepositoryPath !== null) {
    return `"${toWslPath(quotedRepositoryPath[1])}"`
  }

  return value
}

const translateWslGitConfigValue = (value: string): string =>
  value.startsWith('!')
    ? `!${translateQuotedWslPathArgument(
        translateWslPathArgument(value.substring(1))
      )}`
    : translateQuotedWslPathArgument(translateWslPathArgument(value))

export const translateWslGitConfigParameters = (value: string): string =>
  value.replace(
    /'([^'=]+)=([^']*)'/g,
    (_, key: string, configValue: string) => {
      if (configValue.length === 0) {
        return `'${key}='`
      }

      return `'${key}=${translateWslGitConfigValue(configValue)}'`
    }
  )

const appendWslInteropEnvKeys = (value: string | undefined): string => {
  const entries =
    value === undefined || value.length === 0 ? [] : value.split(':')
  const existingKeys = new Set(entries.map(entry => entry.split('/')[0]))

  for (const key of wslInteropEnvKeys) {
    if (!existingKeys.has(key)) {
      entries.push(key)
    }
  }

  return entries.join(':')
}

export const translateWslEnv = (
  env: Record<string, string | undefined>
): ReadonlyArray<string> => {
  const translated = new Array<string>()

  for (const [key, rawValue] of Object.entries(env)) {
    if (rawValue === undefined || bundledGitEnvironmentKeys.has(key)) {
      continue
    }

    if (key === 'PATH' && rawValue.includes(';')) {
      continue
    }

    if (key === 'WSLENV') {
      continue
    }

    let value = rawValue

    switch (key) {
      case 'GIT_CONFIG_PARAMETERS':
        value = translateWslGitConfigParameters(value)
        break
      case 'GIT_ASKPASS':
      case 'SSH_ASKPASS':
        value = translateWslPathArgument(value)
        break
      case 'GIT_SSH_COMMAND':
        value = translateQuotedWslPathArgument(translateWslPathArgument(value))
        break
      default:
        value = translateWslPathArgument(value)
        break
    }

    translated.push(`${key}=${value}`)
  }

  const rawWslEnv = env.WSLENV ?? process.env.WSLENV
  const hasWslInteropEnvKeys = wslInteropEnvKeys.some(
    key => env[key] !== undefined
  )

  if (rawWslEnv !== undefined || hasWslInteropEnvKeys) {
    const wslEnv = hasWslInteropEnvKeys
      ? appendWslInteropEnvKeys(rawWslEnv)
      : rawWslEnv
    translated.push(`WSLENV=${wslEnv}`)
  }

  return translated
}

const translateWslGitArgument = (arg: string): string => {
  const equalsIndex = arg.indexOf('=')

  if (equalsIndex > 0) {
    const prefix = arg.substring(0, equalsIndex + 1)
    const value = arg.substring(equalsIndex + 1)

    if (value.length > 0) {
      return `${prefix}${translateWslPathArgument(value)}`
    }
  }

  return translateWslPathArgument(arg)
}

const resolveGitCommand = (
  args: ReadonlyArray<string>,
  path: string,
  env: Record<string, string | undefined> = {}
): GitCommand => {
  const source = getRepositoryGitSource(path)

  switch (source.kind) {
    case 'bundled': {
      const { env: resolvedEnv, gitLocation } = setupEnvironment(env)
      return {
        command: gitLocation,
        args: [...args],
        cwd: path,
        env: resolvedEnv,
        source,
      }
    }

    case 'external':
      return {
        command: source.path,
        args: [...args],
        cwd: path,
        env: sanitizeWindowsGitEnv(env),
        source,
      }

    case 'wsl': {
      const translatedEnv = translateWslEnv(env)
      const translatedArgs = args.map(translateWslGitArgument)
      const translatedCwd = toWslPath(path)

      return {
        command: 'wsl.exe',
        args: [
          '--cd',
          translatedCwd,
          '--exec',
          ...(translatedEnv.length > 0 ? ['env', ...translatedEnv] : []),
          'git',
          ...translatedArgs,
        ],
        cwd: process.cwd(),
        env: sanitizeWindowsGitEnv({}),
        source,
        wsl: {
          args: translatedArgs,
          cwd: translatedCwd,
          env: translatedEnv,
        },
      }
    }
  }
}

export async function execGitProcess(
  args: string[],
  path: string,
  options?: IGitStringExecutionOptions
): Promise<IGitStringResult>
export async function execGitProcess(
  args: string[],
  path: string,
  options?: IGitBufferExecutionOptions
): Promise<IGitBufferResult>
export async function execGitProcess(
  args: string[],
  path: string,
  options?: DugiteExecutionOptions
): Promise<IGitResult>
export async function execGitProcess(
  args: string[],
  path: string,
  options?: DugiteExecutionOptions
): Promise<IGitResult> {
  const command = resolveGitCommand(args, path, options?.env)

  const execOptions = {
    cwd: command.cwd,
    env: command.env,
    encoding: options?.encoding ?? 'utf8',
    maxBuffer: options?.maxBuffer ?? Infinity,
    signal: options?.signal,
    killSignal: options?.killSignal,
  }

  if (command.source.kind === 'wsl' && command.wsl !== undefined) {
    return execWslGitProcess({
      args: command.wsl.args,
      cwd: command.wsl.cwd,
      env: command.wsl.env,
      processEnv: execOptions.env,
      encoding: execOptions.encoding,
      maxBuffer: execOptions.maxBuffer,
      stdin: options?.stdin,
      stdinEncoding: options?.stdinEncoding,
      signal: options?.signal,
      killSignal: options?.killSignal,
      processCallback: options?.processCallback,
    })
  }

  return new Promise((resolve, reject) => {
    const cp = execFile(
      command.command,
      command.args,
      execOptions,
      (err, stdout, stderr) => {
        if (!err || typeof err.code === 'number') {
          const exitCode = typeof err?.code === 'number' ? err.code : 0
          resolve({ stdout, stderr, exitCode })
          return
        }

        reject(new ExecError(err.message, stdout, stderr, err))
      }
    )

    ignoreClosedInputStream(cp)

    if (options?.stdin !== undefined && cp.stdin) {
      if (options.stdinEncoding) {
        cp.stdin.end(options.stdin, options.stdinEncoding)
      } else {
        cp.stdin.end(options.stdin)
      }
    }

    options?.processCallback?.(cp as ChildProcess)
  })
}

export const spawnGitProcess = (
  args: string[],
  path: string,
  options?: IGitSpawnOptions
): ChildProcessWithoutNullStreams => {
  const {
    command,
    args: commandArgs,
    cwd,
    env,
  } = resolveGitCommand(args, path, options?.env)

  const child = spawn(command, commandArgs, {
    cwd,
    env,
  })

  ignoreClosedInputStream(child)
  return child
}

export async function getGitVersionFromSource(path: string): Promise<string> {
  const result = await execGitProcess(['--version'], path, {
    env: {
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: '',
      TERM: 'dumb',
    },
  })

  return /git version (.*)/.exec(result.stdout.toString())?.at(1) ?? 'unknown'
}
