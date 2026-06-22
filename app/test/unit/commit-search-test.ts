import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  canReuseCommitSearchResults,
  createCommitSearchMatcher,
} from '../../src/lib/commit-search'
import { Commit } from '../../src/models/commit'
import { CommitIdentity } from '../../src/models/commit-identity'

interface ITestCommitOptions {
  readonly sha?: string
  readonly summary?: string
  readonly body?: string
  readonly tags?: ReadonlyArray<string>
  readonly authorName?: string
  readonly authorEmail?: string
  readonly committerName?: string
  readonly committerEmail?: string
}

function buildTestCommit(options: ITestCommitOptions = {}) {
  const {
    sha = 'abcdef1234567890',
    summary = 'Fix login flow',
    body = 'Update validation and error handling',
    tags = ['v1.0.0'],
    authorName = 'Alice Example',
    authorEmail = 'alice@example.com',
    committerName = 'Build Bot',
    committerEmail = 'bot@example.com',
  } = options

  const author = new CommitIdentity(authorName, authorEmail, new Date(0), 0)
  const committer = new CommitIdentity(
    committerName,
    committerEmail,
    new Date(0),
    0
  )

  return new Commit(
    sha,
    sha.slice(0, 7),
    summary,
    body,
    author,
    committer,
    [],
    [],
    tags
  )
}

describe('commit search', () => {
  it('keeps legacy summary, body, tag, and SHA matching', () => {
    const commit = buildTestCommit()

    assert.equal(createCommitSearchMatcher('fix login').matches(commit), true)
    assert.equal(createCommitSearchMatcher('validation').matches(commit), true)
    assert.equal(createCommitSearchMatcher('v1').matches(commit), true)
    assert.equal(createCommitSearchMatcher('abcdef').matches(commit), true)
    assert.equal(
      createCommitSearchMatcher('alice@example.com').matches(commit),
      false
    )
  })

  it('matches author name and email through the author field', () => {
    const commit = buildTestCommit()

    assert.equal(
      createCommitSearchMatcher('author:alice').matches(commit),
      true
    )
    assert.equal(
      createCommitSearchMatcher('author:ALICE@EXAMPLE.COM').matches(commit),
      true
    )
    assert.equal(
      createCommitSearchMatcher('author:"Alice Example"').matches(commit),
      true
    )
    assert.equal(createCommitSearchMatcher('author:bot').matches(commit), false)
  })

  it('matches committer name and email through the committer field', () => {
    const commit = buildTestCommit()

    assert.equal(
      createCommitSearchMatcher('committer:bot').matches(commit),
      true
    )
    assert.equal(
      createCommitSearchMatcher('committer:bot@example.com').matches(commit),
      true
    )
    assert.equal(
      createCommitSearchMatcher('committer:alice').matches(commit),
      false
    )
  })

  it('supports AND and implicit AND between terms', () => {
    const commit = buildTestCommit()

    assert.equal(
      createCommitSearchMatcher('author:alice AND committer:bot').matches(
        commit
      ),
      true
    )
    assert.equal(
      createCommitSearchMatcher('author:alice committer:bot').matches(commit),
      true
    )
    assert.equal(
      createCommitSearchMatcher('author:alice AND committer:ci').matches(
        commit
      ),
      false
    )
  })

  it('supports OR expressions', () => {
    const commit = buildTestCommit()

    assert.equal(
      createCommitSearchMatcher('author:bob OR committer:bot').matches(commit),
      true
    )
    assert.equal(
      createCommitSearchMatcher('author:bob OR committer:ci').matches(commit),
      false
    )
  })

  it('supports NOT expressions', () => {
    const commit = buildTestCommit()

    assert.equal(
      createCommitSearchMatcher('author:alice AND NOT committer:ci').matches(
        commit
      ),
      true
    )
    assert.equal(
      createCommitSearchMatcher('author:alice AND NOT committer:bot').matches(
        commit
      ),
      false
    )
  })

  it('supports parentheses and quoted values', () => {
    const commit = buildTestCommit()

    assert.equal(
      createCommitSearchMatcher(
        '(author:"Alice Example" OR author:bob) AND NOT committer:"Other Bot"'
      ).matches(commit),
      true
    )
    assert.equal(
      createCommitSearchMatcher(
        '(author:bob OR author:carol) AND committer:"Build Bot"'
      ).matches(commit),
      false
    )
  })

  it('falls back to legacy search for malformed advanced syntax', () => {
    const commit = buildTestCommit({
      summary: 'author: placeholder while typing',
    })
    const matcher = createCommitSearchMatcher('author:')

    assert.equal(matcher.isAdvancedSearch, false)
    assert.equal(matcher.matches(commit), true)
  })

  it('only reuses narrowed results for legacy searches', () => {
    assert.equal(canReuseCommitSearchResults('fix', 'fix login'), true)
    assert.equal(
      canReuseCommitSearchResults('author:alice', 'author:alice committer:bot'),
      false
    )
    assert.equal(
      canReuseCommitSearchResults(
        'author:alice',
        'author:alice OR committer:bot'
      ),
      false
    )
    assert.equal(canReuseCommitSearchResults('author:', 'author:a'), false)
  })
})
