const windowsCredentialHelperPathRe = /^(?:[a-zA-Z]:[\\/]|\\\\)/

export function formatCredentialHelperPathForGitConfig(path: string): string {
  const normalizedPath = windowsCredentialHelperPathRe.test(path)
    ? path.replace(/\\/g, '/')
    : path

  return `!"${normalizedPath.replace(/(["\\$`])/g, '\\$1')}"`
}
