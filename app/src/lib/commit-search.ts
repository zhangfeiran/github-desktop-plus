import { Commit } from '../models/commit'
import { CommitIdentity } from '../models/commit-identity'

type CommitSearchField = 'author' | 'committer'
type CommitSearchOperator = 'and' | 'or' | 'not'

type CommitSearchToken =
  | { readonly kind: 'term'; readonly value: string }
  | {
      readonly kind: 'field'
      readonly field: CommitSearchField
      readonly value: string
    }
  | { readonly kind: 'operator'; readonly operator: CommitSearchOperator }
  | { readonly kind: 'left-paren' }
  | { readonly kind: 'right-paren' }

type CommitSearchExpression =
  | { readonly kind: 'term'; readonly value: string }
  | {
      readonly kind: 'field'
      readonly field: CommitSearchField
      readonly value: string
    }
  | { readonly kind: 'not'; readonly expression: CommitSearchExpression }
  | {
      readonly kind: 'and' | 'or'
      readonly left: CommitSearchExpression
      readonly right: CommitSearchExpression
    }

export interface ICommitSearchMatcher {
  readonly isActive: boolean
  readonly isAdvancedSearch: boolean
  readonly matches: (commit: Commit | undefined) => boolean
}

const AdvancedSearchFieldPattern = /(^|[\s(])(?:author|committer)\s*:/i
const FieldPattern = /^(author|committer)\s*:/i

export function createCommitSearchMatcher(query: string): ICommitSearchMatcher {
  const advancedExpression = parseAdvancedCommitSearch(query)

  if (advancedExpression !== null) {
    return {
      isActive: true,
      isAdvancedSearch: true,
      matches: commit =>
        commit !== undefined &&
        evaluateCommitSearch(advancedExpression, commit),
    }
  }

  const legacyQuery = query.toLowerCase()

  return {
    isActive: legacyQuery.length > 0,
    isAdvancedSearch: false,
    matches: commit =>
      commit !== undefined && commitMatchesLegacySearch(commit, legacyQuery),
  }
}

export function canReuseCommitSearchResults(
  previousQuery: string,
  query: string
): boolean {
  if (!query.startsWith(previousQuery)) {
    return false
  }

  const previousSearch = createCommitSearchMatcher(previousQuery)
  const search = createCommitSearchMatcher(query)

  return !previousSearch.isAdvancedSearch && !search.isAdvancedSearch
}

export function commitMatchesLegacySearch(
  commit: Commit,
  filterTextLowerCase: string
): boolean {
  return (
    !filterTextLowerCase ||
    commit.summary.toLowerCase().includes(filterTextLowerCase) ||
    commit.body.toLowerCase().includes(filterTextLowerCase) ||
    commit.tags.some(tag =>
      tag.toLowerCase().startsWith(filterTextLowerCase)
    ) ||
    commit.sha.toLowerCase().startsWith(filterTextLowerCase)
  )
}

function parseAdvancedCommitSearch(
  query: string
): CommitSearchExpression | null {
  if (!AdvancedSearchFieldPattern.test(query)) {
    return null
  }

  const tokens = tokenizeCommitSearchQuery(query)

  if (tokens === null || !tokens.some(token => token.kind === 'field')) {
    return null
  }

  const parser = new CommitSearchParser(tokens)
  return parser.parse()
}

function tokenizeCommitSearchQuery(
  query: string
): ReadonlyArray<CommitSearchToken> | null {
  const tokens = new Array<CommitSearchToken>()
  let index = 0

  while (index < query.length) {
    const char = query[index]

    if (isWhitespace(char)) {
      index++
      continue
    }

    if (char === '(') {
      tokens.push({ kind: 'left-paren' })
      index++
      continue
    }

    if (char === ')') {
      tokens.push({ kind: 'right-paren' })
      index++
      continue
    }

    const fieldMatch = FieldPattern.exec(query.slice(index))

    if (fieldMatch !== null) {
      const field = fieldMatch[1].toLowerCase() as CommitSearchField
      index += fieldMatch[0].length

      while (index < query.length && isWhitespace(query[index])) {
        index++
      }

      const value = readCommitSearchValue(query, index)

      if (value === null || value.value.length === 0) {
        return null
      }

      tokens.push({
        kind: 'field',
        field,
        value: value.value.toLowerCase(),
      })
      index = value.nextIndex
      continue
    }

    const value = readCommitSearchValue(query, index)

    if (value === null || value.value.length === 0) {
      return null
    }

    const valueLowerCase = value.value.toLowerCase()

    if (
      valueLowerCase === 'and' ||
      valueLowerCase === 'or' ||
      valueLowerCase === 'not'
    ) {
      tokens.push({ kind: 'operator', operator: valueLowerCase })
    } else {
      tokens.push({ kind: 'term', value: valueLowerCase })
    }

    index = value.nextIndex
  }

  return tokens
}

function readCommitSearchValue(
  query: string,
  startIndex: number
): { readonly value: string; readonly nextIndex: number } | null {
  if (query[startIndex] === '"') {
    const endIndex = query.indexOf('"', startIndex + 1)

    if (endIndex === -1) {
      return null
    }

    return {
      value: query.substring(startIndex + 1, endIndex),
      nextIndex: endIndex + 1,
    }
  }

  let endIndex = startIndex

  while (
    endIndex < query.length &&
    !isWhitespace(query[endIndex]) &&
    query[endIndex] !== '(' &&
    query[endIndex] !== ')'
  ) {
    endIndex++
  }

  return {
    value: query.substring(startIndex, endIndex),
    nextIndex: endIndex,
  }
}

function isWhitespace(char: string) {
  return /\s/.test(char)
}

class CommitSearchParser {
  private index = 0

  public constructor(
    private readonly tokens: ReadonlyArray<CommitSearchToken>
  ) {}

  public parse(): CommitSearchExpression | null {
    const expression = this.parseOrExpression()

    if (expression === null || this.currentToken !== undefined) {
      return null
    }

    return expression
  }

  private parseOrExpression(): CommitSearchExpression | null {
    let left = this.parseAndExpression()

    if (left === null) {
      return null
    }

    while (this.matchOperator('or')) {
      const right = this.parseAndExpression()

      if (right === null) {
        return null
      }

      left = { kind: 'or', left, right }
    }

    return left
  }

  private parseAndExpression(): CommitSearchExpression | null {
    let left = this.parseUnaryExpression()

    if (left === null) {
      return null
    }

    while (true) {
      if (this.matchOperator('and')) {
        const right = this.parseUnaryExpression()

        if (right === null) {
          return null
        }

        left = { kind: 'and', left, right }
        continue
      }

      if (!this.startsUnaryExpression(this.currentToken)) {
        return left
      }

      const right = this.parseUnaryExpression()

      if (right === null) {
        return null
      }

      left = { kind: 'and', left, right }
    }
  }

  private parseUnaryExpression(): CommitSearchExpression | null {
    if (this.matchOperator('not')) {
      const expression = this.parseUnaryExpression()

      return expression === null ? null : { kind: 'not', expression }
    }

    return this.parsePrimaryExpression()
  }

  private parsePrimaryExpression(): CommitSearchExpression | null {
    const token = this.currentToken

    if (token === undefined) {
      return null
    }

    if (token.kind === 'term' || token.kind === 'field') {
      this.index++
      return token
    }

    if (token.kind === 'left-paren') {
      this.index++
      const expression = this.parseOrExpression()

      if (expression === null || this.currentToken?.kind !== 'right-paren') {
        return null
      }

      this.index++
      return expression
    }

    return null
  }

  private startsUnaryExpression(token: CommitSearchToken | undefined) {
    return (
      token !== undefined &&
      (token.kind === 'term' ||
        token.kind === 'field' ||
        token.kind === 'left-paren' ||
        (token.kind === 'operator' && token.operator === 'not'))
    )
  }

  private matchOperator(operator: CommitSearchOperator) {
    const token = this.currentToken

    if (token?.kind !== 'operator' || token.operator !== operator) {
      return false
    }

    this.index++
    return true
  }

  private get currentToken() {
    return this.tokens[this.index]
  }
}

function evaluateCommitSearch(
  expression: CommitSearchExpression,
  commit: Commit
): boolean {
  switch (expression.kind) {
    case 'term':
      return commitMatchesLegacySearch(commit, expression.value)
    case 'field':
      return evaluateCommitSearchField(
        expression.field,
        expression.value,
        commit
      )
    case 'not':
      return !evaluateCommitSearch(expression.expression, commit)
    case 'and':
      return (
        evaluateCommitSearch(expression.left, commit) &&
        evaluateCommitSearch(expression.right, commit)
      )
    case 'or':
      return (
        evaluateCommitSearch(expression.left, commit) ||
        evaluateCommitSearch(expression.right, commit)
      )
  }
}

function evaluateCommitSearchField(
  field: CommitSearchField,
  value: string,
  commit: Commit
) {
  const identity = field === 'author' ? commit.author : commit.committer
  return commitIdentityMatches(identity, value)
}

function commitIdentityMatches(identity: CommitIdentity, value: string) {
  return (
    identity.name.toLowerCase().includes(value) ||
    identity.email.toLowerCase().includes(value)
  )
}
