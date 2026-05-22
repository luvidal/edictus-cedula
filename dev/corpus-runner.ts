/**
 * Shared corpus runner — used by capture-baseline.ts and check-corpus.ts.
 *
 * Wires the satellite for STANDALONE local use:
 *  - doctypes catalog: read from the sibling Jogi checkout (single source of truth)
 *  - geminiCall: a Vertex-AI client (Jogi runs Gemini on Vertex, not API-key mode),
 *    mirroring lib/server/gemini.ts. This is the same injection the host does via
 *    configure() — without it the satellite's ai.ts would fall back to a
 *    GEMINI_API_KEY the Jogi environment doesn't set.
 *  - AWS Rekognition: faceextract.ts uses the default credential chain + AWS_REGION
 *    (source Jogi's .env.local before running).
 *
 * Produces one PII-SAFE observation per fixture (hashed field values, face-crop
 * SHA, rounded bbox, structural partIds) plus a SEPARATE cleartext record that
 * is written only to the gitignored corpus/cleartext store.
 */

import { createHash, randomBytes } from 'crypto'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import path from 'path'
import { configure } from '../src/config'
import { splitCompositeCedula, extractCedulaFace, detectCedulaSide, isUnreadable } from '../src/facade'
import { extractFace } from '../src/faceextract'
import { safeJsonParse } from '../src/utils'
import { CORPUS, type CorpusFixture } from '../corpus/manifest'

const ROOT = path.resolve(__dirname, '..')
const CORPUS_DIR = path.join(ROOT, 'corpus')
const IMAGES_DIR = path.join(CORPUS_DIR, 'images')
const CLEARTEXT_DIR = path.join(CORPUS_DIR, 'cleartext')
const SYNTHETIC_DIR = path.join(CORPUS_DIR, 'synthetic')
const SALT_FILE = path.join(CLEARTEXT_DIR, '.salt')
const MAP_FILE = path.join(CLEARTEXT_DIR, 'images.map.json')

// ── PII-safe hashing ───────────────────────────────────────────────
// Salt lives in the gitignored cleartext store (travels with the image bytes),
// so committed hashes of low-entropy values (RUTs, birthdates) are NOT
// brute-forceable from git alone.
function getSalt(): string {
  if (existsSync(SALT_FILE)) return readFileSync(SALT_FILE, 'utf8').trim()
  const salt = randomBytes(32).toString('hex')
  writeFileSync(SALT_FILE, salt)
  return salt
}
const SALT = getSalt()
const hashField = (v: unknown): string =>
  createHash('sha256').update(`${SALT}:${String(v)}`).digest('hex').slice(0, 16)
/** Face/image bytes are high-entropy → commit a raw sha256 (no salt needed). */
const sha256 = (buf: Buffer | string): string =>
  createHash('sha256').update(typeof buf === 'string' ? Buffer.from(buf, 'base64') : buf).digest('hex')

// ── Fixture resolution (gitignored map) ─────────────────────────────
interface ImagesMap { fixtures: Record<string, string> }
function resolveFile(fx: CorpusFixture): string | null {
  if (fx.id === 'unreadable-pdf-synthetic') return path.join(SYNTHETIC_DIR, 'unreadable.pdf')
  if (!existsSync(MAP_FILE)) return null
  const map = JSON.parse(readFileSync(MAP_FILE, 'utf8')) as ImagesMap
  const filename = map.fixtures?.[fx.id]
  if (!filename) return null
  const full = path.join(IMAGES_DIR, filename)
  return existsSync(full) ? full : null
}

export function imagesAvailable(): boolean {
  return existsSync(IMAGES_DIR) && existsSync(MAP_FILE) && readdirSync(IMAGES_DIR).length > 0
}

// ── Satellite wiring ────────────────────────────────────────────────
let configured = false
export async function configureSatellite(): Promise<void> {
  if (configured) return
  const doctypesPath =
    process.env.JOGI_DATA_DOCTYPES || path.resolve(ROOT, '../jogi/data/doctypes.json')
  const doctypes = JSON.parse(readFileSync(doctypesPath, 'utf8'))

  const project = process.env.GOOGLE_CLOUD_PROJECT
  const location = process.env.GOOGLE_CLOUD_LOCATION
  if (!project || !location) {
    throw new Error('Missing GOOGLE_CLOUD_PROJECT / GOOGLE_CLOUD_LOCATION — source Jogi .env.local first.')
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { GoogleGenAI } = await import('@google/genai')
  const client = new GoogleGenAI({ vertexai: true, project, location } as any)
  const geminiCall = (params: { model: string; contents: any; config?: any }) =>
    (client as any).models.generateContent(params)

  configure({
    doctypes,
    geminiCall,
    logger: {
      error: (err: unknown, ctx?: Record<string, unknown>) => console.error('[cedula]', err, ctx ?? ''),
      warn: (msg: string, ctx?: Record<string, unknown>) => console.warn('[cedula]', msg, ctx ?? ''),
    },
  })
  configured = true
}

// ── Observation shapes ──────────────────────────────────────────────
/** PII-SAFE — committed to baseline.json. */
export interface Observation {
  id: string
  op: string
  bugClass: string
  /** split: parts present + structure */
  composite?: boolean
  partIds?: string[]
  hasFace?: boolean
  faceCropSha?: string | null
  /** rounded bbox (% coords) — not PII */
  bbox?: { x: number; y: number; width: number; height: number } | null
  faceConfidence?: number | null
  side?: 'front' | 'back' | null
  sideConfidence?: number | null
  renderedMimetype?: string
  sourceHashPresent?: boolean
  unreadable?: boolean
  /** field key → salted hash. Field VALUES never appear here. */
  fields?: Record<string, string>
  error?: string
}
/** CLEARTEXT — written ONLY to the gitignored cleartext store. */
export interface Cleartext {
  id: string
  fields?: Record<string, Record<string, unknown>>
  side?: 'front' | 'back' | null
}

const round = (n: number | undefined | null, d = 1): number | null =>
  n == null ? null : Math.round(n * 10 ** d) / 10 ** d
const roundBbox = (b: { x: number; y: number; width: number; height: number }) => ({
  x: round(b.x, 0)!, y: round(b.y, 0)!, width: round(b.width, 0)!, height: round(b.height, 0)!,
})

function hashFields(data: Record<string, unknown>): { hashed: Record<string, string>; clear: Record<string, unknown> } {
  const hashed: Record<string, string> = {}
  const clear: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (k === 'foto_base64' || v == null || v === '') continue // face handled separately; skip empties
    hashed[k] = hashField(v)
    clear[k] = v
  }
  return { hashed, clear }
}

/** Run one fixture; returns the PII-safe observation + the cleartext sidecar. */
export async function runFixture(fx: CorpusFixture): Promise<{ obs: Observation; clear: Cleartext }> {
  const obs: Observation = { id: fx.id, op: fx.op, bugClass: fx.bugClass }
  const clear: Cleartext = { id: fx.id }
  const file = resolveFile(fx)
  if (!file) {
    obs.error = 'fixture file unavailable (image bytes / map are maintainer-local)'
    return { obs, clear }
  }
  const buffer = readFileSync(file)

  if (fx.op === 'split') {
    const r = await splitCompositeCedula(buffer, fx.mimetype, 'gemini')
    if (isUnreadable(r)) {
      obs.unreadable = true
      return { obs, clear }
    }
    if (!r) {
      obs.composite = false
      return { obs, clear }
    }
    obs.composite = true
    obs.partIds = r.parts.map(p => p.partId)
    obs.renderedMimetype = r.renderedMimetype
    obs.sourceHashPresent = typeof r.sourceHash === 'string' && r.sourceHash.length === 64
    obs.fields = {}
    clear.fields = {}
    const front = r.parts.find(p => p.partId === 'front')
    const back = r.parts.find(p => p.partId === 'back')
    for (const part of r.parts) {
      const data = (safeJsonParse<Record<string, unknown>>(part.aiFields) || {})
      const { hashed, clear: c } = hashFields(data)
      for (const [k, h] of Object.entries(hashed)) obs.fields![`${part.partId}.${k}`] = h
      clear.fields![part.partId] = c
      if (part.docdate) obs.fields![`${part.partId}.docdate`] = hashField(part.docdate)
    }
    // Face crop (front only)
    const frontData = front ? (safeJsonParse<Record<string, any>>(front.aiFields) || {}) : {}
    obs.hasFace = typeof frontData.foto_base64 === 'string'
    obs.faceCropSha = obs.hasFace ? sha256(frontData.foto_base64) : null
    // bbox via internal leaf (harness may use internals directly)
    if (front) {
      const fr = await extractFace(front.buffer)
      obs.bbox = fr ? roundBbox(fr.bbox) : null
      obs.faceConfidence = fr ? round(fr.confidence) : null
    }
    void back
    return { obs, clear }
  }

  if (fx.op === 'face') {
    const r = await extractCedulaFace(buffer, fx.mimetype)
    obs.hasFace = !!r
    obs.faceCropSha = r ? sha256(r.face) : null
    obs.faceConfidence = r ? round(r.confidence) : null
    const fr = await extractFace(buffer)
    obs.bbox = fr ? roundBbox(fr.bbox) : null
    return { obs, clear }
  }

  // side
  const r = await detectCedulaSide(buffer, fx.mimetype, 'gemini')
  obs.side = r.side
  obs.sideConfidence = round(r.confidence)
  clear.side = r.side
  if (r.data) {
    const { hashed, clear: c } = hashFields(r.data as Record<string, unknown>)
    obs.fields = hashed
    clear.fields = { side: c }
  }
  return { obs, clear }
}

export { CORPUS, CLEARTEXT_DIR }
