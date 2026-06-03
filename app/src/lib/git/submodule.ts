import { git } from './core'
import { Repository } from '../../models/repository'
import { SubmoduleEntry } from '../../models/submodule'
import { pathExists } from '../path-exists'
import { join, resolve } from 'path'
import { readFile } from 'fs/promises'

export async function listSubmodules(
  repository: Repository
): Promise<ReadonlyArray<SubmoduleEntry>> {
  const [submodulesFile, submodulesDir] = await Promise.all([
    pathExists(join(repository.path, '.gitmodules')),
    pathExists(join(repository.path, '.git', 'modules')),
  ])

  if (!submodulesFile && !submodulesDir) {
    // repo path + .gitmodules and + .git/modules covers the vast majority of
    // "normal" repositories but if we're in a linked worktree the modules
    // directory is actually in the git common dir so we'll also check for the
    // existence of the modules directory there as well before giving up on the
    // existence of submodules in this repo. We're reading the commondir file
    // ourselves here instead of calling out to git to avoid the cost of
    // spawning a process on Windows
    const commonDirPath = join(repository.resolvedGitDir, 'commondir')
    const commonDir = await readFile(commonDirPath, 'utf8')
      .then(content => content.replace(/\r?\n$/, ''))
      .then(p => (p ? resolve(repository.resolvedGitDir, p) : null))
      .catch(() => null)

    if (!commonDir || !(await pathExists(join(commonDir, 'modules')))) {
      log.info('No submodules found. Skipping "git submodule status"')
      return []
    }
  }

  // We don't recurse when listing submodules here because we don't have a good
  // story about managing these currently. So for now we're only listing
  // changes to the top-level submodules to be consistent with `git status`
  const { stdout, exitCode } = await git(
    ['submodule', 'status', '--'],
    repository.path,
    'listSubmodules',
    { successExitCodes: new Set([0, 128]) }
  )

  if (exitCode === 128) {
    // unable to parse submodules in repository, giving up
    return []
  }

  const submodules = new Array<SubmoduleEntry>()

  // entries are of the format:
  //  1eaabe34fc6f486367a176207420378f587d3b48 git (v2.16.0-rc0)
  //
  // first character:
  //   - " " if no change
  //   - "-" if the submodule is not initialized
  //   - "+" if the currently checked out submodule commit does not match the SHA-1 found in the index of the containing repository
  //   - "U" if the submodule has merge conflicts
  //
  // then the 40-character SHA represents the current commit
  //
  // then the path to the submodule
  //
  // then the output of `git describe` for the submodule in braces
  // we're not leveraging this in the app, so go and read the docs
  // about it if you want to learn more:
  //
  // https://git-scm.com/docs/git-describe
  const statusRe = /^.([^ ]+) (.+) \((.+?)\)$/gm

  for (const [, sha, path, describe] of stdout.matchAll(statusRe)) {
    submodules.push(new SubmoduleEntry(sha, path, describe))
  }

  return submodules
}

export async function resetSubmodulePaths(
  repository: Repository,
  paths: ReadonlyArray<string>
): Promise<void> {
  if (paths.length === 0) {
    return
  }

  await git(
    ['submodule', 'update', '--recursive', '--force', '--', ...paths],
    repository.path,
    'updateSubmodule'
  )
}
