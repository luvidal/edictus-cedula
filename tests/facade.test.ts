import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { splitCompositeCedula, isUnreadable } from '../src/facade'

const SYNTHETIC = path.resolve(__dirname, '../corpus/synthetic/unreadable.pdf')

// These run in CI with NO credentials / network — the unreadable path never
// reaches Gemini or Rekognition.
describe('splitCompositeCedula — unreadable PDF path', () => {
  it('returns the typed {unreadable} marker for a corrupt PDF', async () => {
    const buf = readFileSync(SYNTHETIC)
    const r = await splitCompositeCedula(buf, 'application/pdf', 'gemini')
    expect(isUnreadable(r)).toBe(true)
    if (isUnreadable(r)) {
      expect(r.unreadable).toBe(true)
      expect(typeof r.reason).toBe('string')
      expect(typeof r.encrypted).toBe('boolean')
    }
  })

  it('isUnreadable is false for null and for results', () => {
    expect(isUnreadable(null)).toBe(false)
    expect(isUnreadable({ unreadable: true, reason: 'x', encrypted: false })).toBe(true)
  })
})
