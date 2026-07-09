import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import { writeFile } from 'fs/promises'

import {
  stageWorkingDirectoryFiles,
  unstageWorkingDirectoryFiles,
} from '../../../src/lib/git/stage'
import {
  setupEmptyRepository,
  setupFixtureRepository,
} from '../../helpers/repositories'
import { Repository } from '../../../src/models/repository'
import { getStatusOrThrow } from '../../helpers/status'
import { AppFileStatusKind } from '../../../src/models/status'

describe('git/stage', () => {
  it('stages and unstages modified files', async t => {
    const testRepoPath = await setupFixtureRepository(t, 'test-repo')
    const repository = new Repository(testRepoPath, -1, null, false)

    await writeFile(path.join(repository.path, 'README.md'), 'Hi world\n')

    let status = await getStatusOrThrow(repository)
    let file = status.workingDirectory.files[0]
    assert.equal(file.path, 'README.md')
    assert.equal(file.isStaged, false)

    await stageWorkingDirectoryFiles(repository, [file])

    status = await getStatusOrThrow(repository)
    file = status.workingDirectory.files[0]
    assert.equal(file.path, 'README.md')
    assert.equal(file.isStaged, true)

    await unstageWorkingDirectoryFiles(repository, [file])

    status = await getStatusOrThrow(repository)
    file = status.workingDirectory.files[0]
    assert.equal(file.path, 'README.md')
    assert.equal(file.isStaged, false)
  })

  it('unstages new files before the first commit', async t => {
    const repository = await setupEmptyRepository(t)

    await writeFile(path.join(repository.path, 'new-file.md'), 'hello\n')

    let status = await getStatusOrThrow(repository)
    let file = status.workingDirectory.files[0]
    assert.equal(file.status.kind, AppFileStatusKind.Untracked)
    assert.equal(file.isStaged, false)

    await stageWorkingDirectoryFiles(repository, [file])

    status = await getStatusOrThrow(repository)
    file = status.workingDirectory.files[0]
    assert.equal(file.status.kind, AppFileStatusKind.New)
    assert.equal(file.isStaged, true)

    await unstageWorkingDirectoryFiles(repository, [file])

    status = await getStatusOrThrow(repository)
    file = status.workingDirectory.files[0]
    assert.equal(file.status.kind, AppFileStatusKind.Untracked)
    assert.equal(file.isStaged, false)
  })
})
