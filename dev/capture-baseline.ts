/**
 * Capture the regression baseline from the CURRENT pipeline.
 *
 * Writes:
 *  - corpus/baseline.json        (COMMITTED — PII-safe: hashed fields, face SHAs, bbox)
 *  - corpus/cleartext/<id>.json  (GITIGNORED — cleartext field values for local debugging)
 *
 * The satellite is a verbatim lift-and-shift of the @jogi/docs cédula code, so
 * this baseline IS the @jogi/docs baseline by construction. It is the safety
 * net: future model bumps / refactors that change a face crop, bbox, partId, or
 * rendered-source metadata fail the parity check loudly.
 *
 * Usage (from the satellite root, with Jogi credentials in scope):
 *   source /Users/avd/GitHub/jogi/.env.local && npm run corpus:baseline
 */

import { writeFileSync } from 'fs'
import path from 'path'
import { CORPUS, CLEARTEXT_DIR, configureSatellite, imagesAvailable, runFixture } from './corpus-runner'

async function main() {
  if (!imagesAvailable()) {
    console.error('No corpus images found. Place the maintainer-local image bytes in corpus/images/ and the id→filename map in corpus/cleartext/images.map.json.')
    process.exit(1)
  }
  await configureSatellite()

  const baseline: Record<string, unknown> = {
    capturedAt: new Date().toISOString(),
    note: 'PII-safe baseline. Field VALUES are salted-hashed (salt is gitignored). Face crops are sha256 of the base64 crop. Bytes + cleartext are maintainer-local.',
    fixtures: {} as Record<string, unknown>,
  }

  for (const fx of CORPUS) {
    process.stdout.write(`• ${fx.id} (${fx.op}) … `)
    try {
      const { obs, clear } = await runFixture(fx)
      ;(baseline.fixtures as Record<string, unknown>)[fx.id] = obs
      writeFileSync(path.join(CLEARTEXT_DIR, `${fx.id}.json`), JSON.stringify(clear, null, 2))
      console.log(obs.error ? `SKIP (${obs.error})` : 'ok')
    } catch (err) {
      console.log(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
      ;(baseline.fixtures as Record<string, unknown>)[fx.id] = { id: fx.id, op: fx.op, error: err instanceof Error ? err.message : String(err) }
    }
  }

  const out = path.resolve(__dirname, '../corpus/baseline.json')
  writeFileSync(out, JSON.stringify(baseline, null, 2) + '\n')
  console.log(`\nBaseline written → ${out}`)
}

main().catch(err => { console.error(err); process.exit(1) })
