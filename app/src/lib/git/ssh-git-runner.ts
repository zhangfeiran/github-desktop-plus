import {
  spawn,
  type ChildProcessWithoutNullStreams,
  type ChildProcess,
} from 'child_process'
import {
  PersistentShellGitRunner,
  shellQuote,
  type ShellGitExecutionOptions,
} from './wsl-git-runner'

export type SshGitExecutionOptions = ShellGitExecutionOptions & {
  readonly command: string
}

type SshGitSpawnOptions = {
  readonly command: string
  readonly args: ReadonlyArray<string>
  readonly cwd: string
  readonly env: ReadonlyArray<string>
  readonly processEnv: NodeJS.ProcessEnv
}

const sshOptionsWithSeparateValue = new Set([
  '-B',
  '-b',
  '-c',
  '-D',
  '-E',
  '-e',
  '-F',
  '-I',
  '-i',
  '-J',
  '-L',
  '-l',
  '-m',
  '-O',
  '-o',
  '-p',
  '-Q',
  '-R',
  '-S',
  '-W',
  '-w',
])

export function parseSshCommandLine(command: string): string[] {
  const args = new Array<string>()
  let current = ''
  let quote: '"' | "'" | null = null
  let escaping = false
  let started = false

  for (const char of command) {
    if (escaping) {
      current += char
      escaping = false
      started = true
      continue
    }

    if (char === '\\' && quote !== "'") {
      escaping = true
      started = true
      continue
    }

    if (quote !== null) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      started = true
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      started = true
      continue
    }

    if (/\s/.test(char)) {
      if (started) {
        args.push(current)
        current = ''
        started = false
      }
      continue
    }

    current += char
    started = true
  }

  if (escaping) {
    current += '\\'
  }

  if (started) {
    args.push(current)
  }

  return args
}

const optionNeedsSeparateValue = (arg: string) =>
  sshOptionsWithSeparateValue.has(arg)

const takeSshOption = (
  args: ReadonlyArray<string>,
  index: number
): { readonly values: ReadonlyArray<string>; readonly nextIndex: number } => {
  const arg = args[index]

  if (optionNeedsSeparateValue(arg) && index + 1 < args.length) {
    return { values: [arg, args[index + 1]], nextIndex: index + 2 }
  }

  return { values: [arg], nextIndex: index + 1 }
}

const normalizeSshArguments = (
  args: ReadonlyArray<string>
): ReadonlyArray<string> => {
  const options = new Array<string>()
  const trailingOptions = new Array<string>()
  const remoteCommand = new Array<string>()
  let destination: string | null = null
  let index = 0

  while (index < args.length) {
    const arg = args[index]

    if (destination === null) {
      if (arg.startsWith('-')) {
        const option = takeSshOption(args, index)
        options.push(...option.values)
        index = option.nextIndex
        continue
      }

      destination = arg
      index++
      continue
    }

    if (arg.startsWith('-')) {
      const option = takeSshOption(args, index)
      trailingOptions.push(...option.values)
      index = option.nextIndex
      continue
    }

    remoteCommand.push(arg)
    index++
  }

  return [
    ...options,
    ...trailingOptions,
    ...(destination !== null ? [destination] : []),
    ...remoteCommand,
  ]
}

export const getSshGitCommandArgs = (
  command: string
): ReadonlyArray<string> => {
  const parts = parseSshCommandLine(command)
  if (parts.length === 0) {
    return ['ssh']
  }

  const [executable, ...args] = parts
  return [executable, ...normalizeSshArguments(args)]
}

const runnerKey = (commandArgs: ReadonlyArray<string>) => commandArgs.join('\0')

const runners = new Map<string, PersistentShellGitRunner>()

const spawnSshShell = (
  commandArgs: ReadonlyArray<string>,
  processEnv: NodeJS.ProcessEnv
): ChildProcess =>
  spawn(
    'wsl.exe',
    ['--exec', ...commandArgs, 'bash', '--noprofile', '--norc'],
    {
      cwd: process.cwd(),
      env: processEnv,
    }
  )

const getRunner = (command: string) => {
  const commandArgs = getSshGitCommandArgs(command)
  const key = runnerKey(commandArgs)
  let runner = runners.get(key)

  if (runner === undefined) {
    runner = new PersistentShellGitRunner('SSH Git runner', processEnv =>
      spawnSshShell(commandArgs, processEnv)
    )
    runners.set(key, runner)
  }

  return runner
}

export const execSshGitProcess = (options: SshGitExecutionOptions) =>
  getRunner(options.command).exec(options)

export const createSshGitSpawnScript = ({
  args,
  cwd,
  env,
}: Pick<SshGitSpawnOptions, 'args' | 'cwd' | 'env'>) => {
  const envArgs = env.map(shellQuote)
  const gitCommand = ['env', ...envArgs, 'git', ...args.map(shellQuote)].join(
    ' '
  )

  return `cd -- ${shellQuote(cwd)} && exec ${gitCommand} < /dev/null`
}

export const spawnSshGitProcess = ({
  command,
  args,
  cwd,
  env,
  processEnv,
}: SshGitSpawnOptions): ChildProcessWithoutNullStreams => {
  const commandArgs = getSshGitCommandArgs(command)
  const script = createSshGitSpawnScript({ args, cwd, env })
  const remoteCommand = `bash --noprofile --norc -c ${shellQuote(script)}`

  return spawn('wsl.exe', ['--exec', ...commandArgs, remoteCommand], {
    cwd: process.cwd(),
    env: processEnv,
  })
}

export const shutdownSshGitRunners = () => {
  for (const runner of runners.values()) {
    runner.shutdown()
  }
  runners.clear()
}
