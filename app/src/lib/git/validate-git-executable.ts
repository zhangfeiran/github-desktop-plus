import { execFile } from '../exec-file'

export async function validateExternalGitExecutablePath(
  path: string
): Promise<boolean> {
  if (!__WIN32__) {
    return false
  }

  if (!/[\\/]git\.exe$/i.test(path)) {
    return false
  }

  try {
    const { stdout } = await execFile(path, ['--version'], {
      timeout: 5000,
      windowsHide: true,
    })

    return /^git version /i.test(stdout)
  } catch (e) {
    log.warn(`Failed to validate external Git executable at ${path}`, e)
    return false
  }
}
