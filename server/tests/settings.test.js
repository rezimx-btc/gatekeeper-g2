// Settings store unit tests — run with `npm test` (node --test). No network:
// the store is exercised against temp files only, never the live settings.

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSettingsStore, DEFAULT_SETTINGS, SettingsValidationError } from '../src/settings.js'

let dir
let file

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gatekeeper-settings-'))
  file = join(dir, 'settings.json')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('createSettingsStore defaults', () => {
  it('returns defaults when the file is missing', () => {
    const store = createSettingsStore(file)
    assert.deepEqual(store.get(), { ...DEFAULT_SETTINGS, defaults: { ...DEFAULT_SETTINGS }, isDefault: true })
    assert.equal(store.get().perTradeCapUsd, 25)
    assert.equal(store.get().dailyCapUsd, 100)
    assert.equal(store.get().allowlistEnabled, true)
  })

  it('returns defaults when the file is corrupt', () => {
    writeFileSync(file, '{not json at all')
    assert.equal(createSettingsStore(file).get().isDefault, true)
    writeFileSync(file, '[]')
    assert.equal(createSettingsStore(file).get().isDefault, true)
    writeFileSync(file, '"just a string"')
    assert.equal(createSettingsStore(file).get().isDefault, true)
  })

  it('keeps valid stored fields and defaults the bad ones', () => {
    writeFileSync(file, JSON.stringify({ perTradeCapUsd: 10, dailyCapUsd: 'oops', unknownField: 1 }))
    const got = createSettingsStore(file).get()
    assert.equal(got.perTradeCapUsd, 10)
    assert.equal(got.dailyCapUsd, 100) // invalid stored value → default
    assert.equal(got.isDefault, false)
  })
})

describe('update', () => {
  it('applies a valid partial patch and persists it', () => {
    const store = createSettingsStore(file)
    const got = store.update({ perTradeCapUsd: 5 })
    assert.equal(got.perTradeCapUsd, 5)
    assert.equal(got.dailyCapUsd, 100)
    assert.equal(got.isDefault, false)
    // A fresh store on the same file reads the persisted value.
    assert.equal(createSettingsStore(file).get().perTradeCapUsd, 5)
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).perTradeCapUsd, 5)
  })

  it('accepts the boundary values', () => {
    const store = createSettingsStore(file)
    assert.equal(store.update({ perTradeCapUsd: 1 }).perTradeCapUsd, 1)
    assert.equal(store.update({ perTradeCapUsd: 1000 }).perTradeCapUsd, 1000)
    assert.equal(store.update({ dailyCapUsd: 1 }).dailyCapUsd, 1)
    assert.equal(store.update({ dailyCapUsd: 10000 }).dailyCapUsd, 10000)
    assert.equal(store.update({ allowlistEnabled: false }).allowlistEnabled, false)
  })

  it('rejects zero, negative, non-number and out-of-range caps', () => {
    const store = createSettingsStore(file)
    for (const bad of [0, -1, -25, '10', null, NaN, Infinity, 1001]) {
      assert.throws(
        () => store.update({ perTradeCapUsd: bad }),
        SettingsValidationError,
        `perTradeCapUsd=${String(bad)}`,
      )
    }
    for (const bad of [0, -1, '100', 10001]) {
      assert.throws(() => store.update({ dailyCapUsd: bad }), SettingsValidationError)
    }
    // Failed updates leave the stored values untouched.
    assert.equal(store.get().isDefault, true)
  })

  it('rejects a non-boolean allowlistEnabled', () => {
    const store = createSettingsStore(file)
    for (const bad of ['false', 0, 1, null]) {
      assert.throws(() => store.update({ allowlistEnabled: bad }), SettingsValidationError)
    }
    assert.equal(store.get().isDefault, true)
  })

  it('rejects unknown fields and non-object patches', () => {
    const store = createSettingsStore(file)
    assert.throws(() => store.update({ priceSanityPct: 0.05 }), /unknown settings field/)
    assert.throws(() => store.update({ foo: 1 }), /unknown settings field/)
    assert.throws(() => store.update(null), SettingsValidationError)
    assert.throws(() => store.update([1]), SettingsValidationError)
    assert.throws(() => store.update('reset'), SettingsValidationError)
    assert.equal(store.get().isDefault, true)
  })
})

describe('reset', () => {
  it('restores defaults and persists them', () => {
    const store = createSettingsStore(file)
    store.update({ perTradeCapUsd: 5, dailyCapUsd: 50, allowlistEnabled: false })
    assert.equal(store.get().isDefault, false)
    const got = store.reset()
    assert.deepEqual(got, { ...DEFAULT_SETTINGS, defaults: { ...DEFAULT_SETTINGS }, isDefault: true })
    assert.equal(createSettingsStore(file).get().isDefault, true)
  })
})
