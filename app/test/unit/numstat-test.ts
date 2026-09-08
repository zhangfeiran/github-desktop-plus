import assert from 'node:assert'
import { describe, it } from 'node:test'
import { parseNumstat } from '../../src/lib/numstat'
import { parseRawLogWithNumstat } from '../../src/lib/git/log'

describe('file numstat parsing', () => {
  it('keeps binary and zero-line text changes distinct and preserves literal paths', () => {
    const stats = parseNumstat(
      ['12\t3\t目录/a\tb\n.txt', '-\t-\timage.png', '0\t0\tempty.txt', ''].join(
        '\0'
      )
    )
    assert.deepStrictEqual(Array.from(stats), [
      ['目录/a\tb\n.txt', { kind: 'text', linesAdded: 12, linesDeleted: 3 }],
      ['image.png', { kind: 'binary' }],
      ['empty.txt', { kind: 'text', linesAdded: 0, linesDeleted: 0 }],
    ])
  })

  it('consumes rename and copy paths even when a path looks like a numstat record', () => {
    const stats = parseNumstat(
      [
        '2\t1\t',
        'old\nname',
        '99\t88\tnew.txt',
        '-\t-\t',
        'old.png',
        'new.png',
        '1\t0\tlast.txt',
        '',
      ].join('\0')
    )
    assert.deepStrictEqual(Array.from(stats), [
      ['99\t88\tnew.txt', { kind: 'text', linesAdded: 2, linesDeleted: 1 }],
      ['new.png', { kind: 'binary' }],
      ['last.txt', { kind: 'text', linesAdded: 1, linesDeleted: 0 }],
    ])
  })

  it('attaches raw log statistics to the correct files while preserving totals', () => {
    const changes = parseRawLogWithNumstat(
      [
        ':100644 100644 1234567 7654321 R090',
        'old.txt',
        'new.txt',
        ':100644 100644 1234567 7654321 M',
        'image.png',
        ':000000 100644 0000000 7654321 A',
        'last.txt',
        '2\t1\t',
        'old.txt',
        'new.txt',
        '-\t-\timage.png',
        '3\t0\tlast.txt',
        '',
      ].join('\0'),
      'after',
      'before'
    )

    assert.equal(changes.linesAdded, 5)
    assert.equal(changes.linesDeleted, 1)
    assert.deepStrictEqual(
      changes.files.map(f => [f.path, f.diffStats]),
      [
        ['new.txt', { kind: 'text', linesAdded: 2, linesDeleted: 1 }],
        ['image.png', { kind: 'binary' }],
        ['last.txt', { kind: 'text', linesAdded: 3, linesDeleted: 0 }],
      ]
    )
  })
})
