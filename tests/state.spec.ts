/**
 * Unit tests for the plugin state persistence (src/state.ts): defaults,
 * clamping, atomic read/write round-trips against a throwaway HOME.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { normalizeState, readState, stateFilePath, writeState } from '../src/state.ts'

let home: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-we-wallpaper-state-'))
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

describe('normalizeState', () => {
  it('applies defaults to an empty section', () => {
    expect(normalizeState({})).toEqual({ selectedId: '', scrim: 25, translucency: 50, fit: 'cover', sharpen: 40,
      animatedPreviews: false,
    })
  })

  it('clamps out-of-bounds numbers and coerces the fit', () => {
    expect(normalizeState({ scrim: 500, translucency: -10, fit: 'weird' })).toEqual({
      selectedId: '',
      scrim: 100,
      translucency: 0,
      fit: 'cover',
      sharpen: 40,
      animatedPreviews: false,
    })
    expect(normalizeState({ fit: 'contain', sharpen: 99 }).fit).toBe('contain')
    expect(normalizeState({ sharpen: 250 }).sharpen).toBe(100)
    expect(normalizeState({ sharpen: -5 }).sharpen).toBe(0)
  })

  it('drops unknown fields and non-object input', () => {
    expect(normalizeState({ nope: 1, selectedId: '123' })).toEqual({
      selectedId: '123',
      scrim: 25,
      translucency: 50,
      fit: 'cover',
      sharpen: 40,
      animatedPreviews: false,
    })
    expect(normalizeState('junk').selectedId).toBe('')
  })
})

describe('readState / writeState', () => {
  it('returns defaults when no state file exists', () => {
    expect(readState(home)).toEqual({ selectedId: '', scrim: 25, translucency: 50, fit: 'cover', sharpen: 40,
      animatedPreviews: false,
    })
  })

  it('round-trips a partial write and survives a re-read', () => {
    const next = writeState({ selectedId: '2781279360', scrim: 40 }, home)
    expect(next.selectedId).toBe('2781279360')
    expect(next.scrim).toBe(40)
    expect(next.translucency).toBe(50)
    expect(readState(home)).toEqual(next)
  })

  it('merges over the persisted state and writes atomically', () => {
    writeState({ selectedId: '111', fit: 'contain' }, home)
    const next = writeState({ translucency: 30 }, home)
    expect(next).toEqual({ selectedId: '111', scrim: 25, translucency: 30, fit: 'contain', sharpen: 40,
      animatedPreviews: false,
    })
    // Atomic write: no temp file left behind.
    expect(readFileSync(stateFilePath(home), 'utf8')).not.toContain('.tmp')
  })

  it('falls back to defaults on a corrupted file', () => {
    writeFileSync(stateFilePath(home), '{broken json', 'utf8')
    expect(readState(home)).toEqual({ selectedId: '', scrim: 25, translucency: 50, fit: 'cover', sharpen: 40,
      animatedPreviews: false,
    })
  })
})
