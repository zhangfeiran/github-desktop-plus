import { shell } from '../../lib/app-shell'
import { toSshFsLocalPath } from '../../lib/git/source'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'

export async function openFile(
  fullPath: string,
  dispatcher: Dispatcher,
  repository?: Repository
): Promise<void> {
  const localPath =
    repository !== undefined
      ? toSshFsLocalPath(fullPath, repository.gitSourceOverride)
      : fullPath
  const result = await shell.openExternal(`file://${localPath}`)

  if (!result) {
    const error = {
      name: 'no-external-program',
      message: `Unable to open file ${localPath} in an external program. Please check you have a program associated with this file extension`,
    }
    await dispatcher.postError(error)
  }
}
