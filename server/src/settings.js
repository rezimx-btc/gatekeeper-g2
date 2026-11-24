// settings.js — gate settings store (Day 4).
// User-tunable gate policy persisted to data/settings.json (JSON, no secrets).
// Defaults: per-trade cap $25, daily cap $100, allowlist ON. A missing or
// corrupt file falls back to defaults. Unknown fields and out-of-range
// values are rejected (SettingsValidationError, mapped to HTTP 400).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_SETTINGS = {
  perTradeCapUsd: 25,
  dailyCapUsd: 100,
  allowlistEnabled: true,
}

const KNOWN_FIELDS = new Set(['perTradeCapUsd', 'dailyCapUsd', 'allowlistEnabled'])

const LIMITS = {
  perTradeCapUsd: { min: 1, max: 1000 },
  dailyCapUsd: { min: 1, max: 10000 },
}

export class SettingsValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SettingsValidationError'
    this.status = 400
  }
}

function validateCap(field, value) {
  const { min, max } = LIMITS[field]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SettingsValidationError(`${field} must be a number, got ${String(value)}`)
  }
  if (value < min || value > max) {
    throw new SettingsValidationError(`${field} must be between ${min} and ${max}, got ${value}`)
  }
  return value
}

function validateAllowlistEnabled(value) {
  if (typeof value !== 'boolean') {
    throw new SettingsValidationError(`allowlistEnabled must be a boolean, got ${String(value)}`)
  }
  return value
}

/** Validate one known field; throws SettingsValidationError on bad values. */
function validateField(field, value) {
  if (field === 'perTradeCapUsd' || field === 'dailyCapUsd') return validateCap(field, value)
  if (field === 'allowlistEnabled') return validateAllowlistEnabled(value)
  throw new SettingsValidationError(`unknown settings field: ${field}`)
}

/** Validate a patch object; returns a cleaned patch (known fields only). */
export function validateSettingsPatch(patch) {
  if (patch == null || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new SettingsValidationError('settings patch must be a JSON object')
  }
  const cleaned = {}
  for (const [field, value] of Object.entries(patch)) {
    if (!KNOWN_FIELDS.has(field)) {
      throw new SettingsValidationError(`unknown settings field: ${field}`)
    }
    cleaned[field] = validateField(field, value)
  }
  return cleaned
}

export function createSettingsStore(filePath) {
  let current = { ...DEFAULT_SETTINGS }

  function load() {
    try {
      if (!existsSync(filePath)) return
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
      if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return
      const next = { ...DEFAULT_SETTINGS }
      for (const [field, value] of Object.entries(parsed)) {
        if (!KNOWN_FIELDS.has(field)) continue
        try {
          next[field] = validateField(field, value)
        } catch {
          // One bad stored value falls back to its default; the rest survives.
        }
      }
      current = next
    } catch {
      // Missing or corrupt file → defaults.
      current = { ...DEFAULT_SETTINGS }
    }
  }

  function save() {
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, JSON.stringify(current, null, 2))
  }

  load()

  return {
    /** Current settings + defaults + whether they equal the defaults. */
    get() {
      const isDefault =
        current.perTradeCapUsd === DEFAULT_SETTINGS.perTradeCapUsd &&
        current.dailyCapUsd === DEFAULT_SETTINGS.dailyCapUsd &&
        current.allowlistEnabled === DEFAULT_SETTINGS.allowlistEnabled
      return { ...current, defaults: { ...DEFAULT_SETTINGS }, isDefault }
    },
    /** Apply a partial patch (validated), persist, return get(). */
    update(patch) {
      const cleaned = validateSettingsPatch(patch)
      current = { ...current, ...cleaned }
      save()
      return this.get()
    },
    /** Restore defaults, persist, return get(). */
    reset() {
      current = { ...DEFAULT_SETTINGS }
      save()
      return this.get()
    },
  }
}

const DEFAULT_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'settings.json')

export const settingsStore = createSettingsStore(DEFAULT_FILE)
