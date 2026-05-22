/**
 * Re-run the corpus and diff against the committed baseline.
 *
 * This is the self-debuggable black box: per fixture it prints the observed
 * structure (partIds, face-crop SHA, bbox, side, rendered metadata) and the
 * CLEARTEXT field values (read from the gitignored cleartext store) so an agent
 * working inside the satellite can diagnose a regression without leaving git.
 *
 * Deterministic fields (face-crop SHA, bbox, partIds, rendered metadata,
 * sourceHash presence, side) are hard-diffed. Gemini-extracted field hashes are
 * reported as match/CHANGED — model non-determinism means a change is a signal
 * to inspect, not necessarily a failure.
 *
 * Usage:
 *   source /Users/avd/GitHub/jogi/.env.local && npm run corpus:check
 */

import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { CORPUS, CLEARTEXT_DIR, configureSatellite, imagesAvailable, runFixture, type Observation } from './corpus-runner'

const BASELINE = path.resolve(__dirname, '../corpus/baseline.json')

function loadBaseline(): Record<string, Observation> {
  if (!existsSync(BASELINE)) {
    console.error('No baseline.json — run `npm run corpus:baseline` first.')
    process.exit(1)
  }
  return JSON.parse(readFileSync(BASELINE, 'utf8')).fixtures
}

function loadCleartext(id: string): unknown {
  const f = path.join(CLEARTEXT_DIR, `${id}.json`)
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null
}

// Structural guarantees — hard-asserted for every op.
const STRUCTURAL: Array<keyof Observation> = [
  'composite', 'partIds', 'hasFace', 'side',
  'renderedMimetype', 'sourceHashPresent', 'unreadable',
]
// Face crop + bbox are deterministic ONLY when Rekognition runs on a stable
// input (the `face` / `side` ops). For `split`, the crop region comes from a
// non-deterministic Gemini bbox, so these are informational there.
const FACE_KEYS: Array<keyof Observation> = ['faceCropSha', 'bbox', 'faceConfidence']

function diff(base: Observation, now: Observation): string[] {
  const issues: string[] = []
  const hardKeys = base.op === 'split' ? STRUCTURAL : [...STRUCTURAL, ...FACE_KEYS]
  for (const k of hardKeys) {
    const a = JSON.stringify(base[k]); const b = JSON.stringify(now[k])
    if (a !== b) issues.push(`  ✗ ${String(k)}: baseline=${a} now=${b}`)
  }
  if (base.op === 'split') {
    for (const k of FACE_KEYS) {
      const a = JSON.stringify(base[k]); const b = JSON.stringify(now[k])
      if (a !== b) issues.push(`  ~ ${String(k)}: changed (split crop derives from non-deterministic Gemini bbox — inspect)`)
    }
  }
  // field hashes — informational
  const bf = base.fields || {}; const nf = now.fields || {}
  for (const key of new Set([...Object.keys(bf), ...Object.keys(nf)])) {
    if (bf[key] !== nf[key]) issues.push(`  ~ field ${key}: CHANGED (model non-determinism — inspect cleartext)`)
  }
  return issues
}

async function main() {
  if (!imagesAvailable()) {
    console.error('No corpus images found — this is a maintainer-local step.')
    process.exit(1)
  }
  await configureSatellite()
  const baseline = loadBaseline()
  let hardFailures = 0

  for (const fx of CORPUS) {
    const { obs } = await runFixture(fx)
    const base = baseline[fx.id]
    console.log(`\n=== ${fx.id} (${fx.op}) — ${fx.bugClass} ===`)
    console.log(`  partIds=${JSON.stringify(obs.partIds)} side=${obs.side ?? '—'} hasFace=${obs.hasFace ?? '—'} faceSha=${obs.faceCropSha?.slice(0, 12) ?? '—'} bbox=${JSON.stringify(obs.bbox)} rendered=${obs.renderedMimetype ?? '—'} unreadable=${obs.unreadable ?? false}`)
    const clear = loadCleartext(fx.id)
    if (clear) console.log('  cleartext:', JSON.stringify((clear as any).fields ?? clear))
    if (!base) { console.log('  (no baseline entry — new fixture)'); continue }
    const issues = diff(base, obs)
    const hard = issues.filter(i => i.startsWith('  ✗'))
    if (hard.length) hardFailures += hard.length
    if (issues.length) issues.forEach(i => console.log(i)); else console.log('  ✓ matches baseline')
  }

  console.log(`\n${hardFailures === 0 ? '✓ PARITY OK — 0 deterministic divergences' : `✗ ${hardFailures} DETERMINISTIC DIVERGENCE(S)`}`)
  process.exit(hardFailures === 0 ? 0 : 1)
}

main().catch(err => { console.error(err); process.exit(1) })
