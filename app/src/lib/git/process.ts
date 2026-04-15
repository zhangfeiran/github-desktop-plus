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

type GitCommand = {
  readonly command: string
  readonly args: ReadonlyArray<string>
  readonly cwd: string
  readonly env: Record<string, string | undefined>
  readonly source: RepositoryGitSource
}

const bundledGitEnvironmentKeys = new Set([
  'LOCAL_GIT_DIRECTORY',
  'GIT_EXEC_PATH',
  'GIT_TEMPLATE_DIR',
  'GIT_CONFIG_SYSTEM',
  'PREFIX',
])

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

const translateWslEnv = (
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

      return {
        command: 'wsl.exe',
        args: [
          '--cd',
          toWslPath(path),
          '--exec',
          ...(translatedEnv.length > 0 ? ['env', ...translatedEnv] : []),
          'git',
          ...translatedArgs,
        ],
        cwd: process.cwd(),
        env: sanitizeWindowsGitEnv({}),
        source,
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
  const {
    command,
    args: commandArgs,
    cwd,
    env,
  } = resolveGitCommand(args, path, options?.env)

  const execOptions = {
    cwd,
    env,
    encoding: options?.encoding ?? 'utf8',
    maxBuffer: options?.maxBuffer ?? Infinity,
    signal: options?.signal,
    killSignal: options?.killSignal,
  }

  return new Promise((resolve, reject) => {
    const cp = execFile(
      command,
      commandArgs,
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
