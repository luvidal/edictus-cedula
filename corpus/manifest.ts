/**
 * Regression corpus manifest — COMMITTED, PII-FREE.
 *
 * Fixtures are referenced by neutral IDs. The ID → real-filename mapping lives
 * in the gitignored `corpus/cleartext/images.map.json` (maintainer-local), and
 * the image bytes themselves live in the gitignored `corpus/images/`. Running
 * the corpus is therefore a local step (bytes + map stay on the maintainer's
 * machine); only this manifest, the baselines, and the runners enter git.
 *
 * Each fixture names the façade operation it exercises and the historical
 * cédula bug class it guards, so a future model bump fails loudly instead of
 * silently regressing.
 */

export type CorpusOp = 'split' | 'face' | 'side'

export interface CorpusFixture {
  /** Neutral, PII-free id. Resolved to a real filename via images.map.json. */
  id: string
  /** Mimetype of the input file. */
  mimetype: string
  /** Which façade entry point this fixture drives. */
  op: CorpusOp
  /** Expected high-level outcome (structure only — never field values). */
  expect: {
    /** For `split`: is the input a composite (front+back) cédula? */
    composite?: boolean
    /** For `split`: ordered partIds expected in `parts`. */
    partIds?: Array<'front' | 'back'>
    /** For `split`: does the front part carry a face crop (`foto_base64`)? */
    hasFace?: boolean
    /** For `side`: detected side. */
    side?: 'front' | 'back' | null
    /** For `split` on PDF input: rendered mimetype the façade must return. */
    renderedMimetype?: string
    /** Typed unreadable marker expected (synthetic encrypted/corrupt PDF). */
    unreadable?: boolean
  }
  /** Historical cédula bug class this fixture is the named regression test for. */
  bugClass: string
  /** PII-free note. */
  notes: string
}

export const CORPUS: CorpusFixture[] = [
  {
    id: 'composite-pdf-1',
    mimetype: 'application/pdf',
    op: 'split',
    expect: { composite: true, partIds: ['front', 'back'], hasFace: true, renderedMimetype: 'image/png' },
    bugClass: 'pdf-rasterize + composite split',
    notes: 'Single-page PDF with front+back on one page. Exercises rasterize-if-PDF → V3 split → rendered-source metadata (sourceHash = hash of rendered PNG, not original PDF).',
  },
  {
    id: 'composite-image-1',
    mimetype: 'image/jpeg',
    op: 'split',
    expect: { composite: true, partIds: ['front', 'back'], hasFace: true, renderedMimetype: 'image/jpeg' },
    bugClass: 'composite split (stacked image)',
    notes: 'Front+back stacked in one JPEG. Image input → rendered values equal input.',
  },
  {
    id: 'composite-image-2',
    mimetype: 'image/png',
    op: 'split',
    expect: { composite: true, partIds: ['front', 'back'], hasFace: true, renderedMimetype: 'image/png' },
    bugClass: 'composite split (PNG)',
    notes: 'Front+back composite PNG.',
  },
  {
    id: 'composite-image-gap-1',
    mimetype: 'image/png',
    op: 'split',
    expect: { composite: true, partIds: ['front', 'back'], hasFace: true, renderedMimetype: 'image/png' },
    bugClass: 'whitespace-gap composite (sharp.trim border removal)',
    notes: 'Front+back with a white gap between cards — exercises the trim() step that prevents the loose-bbox face-extract miss.',
  },
  {
    id: 'composite-pdf-multidoc-1',
    mimetype: 'application/pdf',
    op: 'split',
    expect: { composite: true, partIds: ['front', 'back'], hasFace: true, renderedMimetype: 'image/png' },
    bugClass: 'multi-doc PDF — page-1 composite cédula only',
    notes: 'Page 1 is a composite cédula; page 2 is an unrelated certificate. Façade rasterizes/ splits page 1 only.',
  },
  {
    id: 'front-image-1',
    mimetype: 'image/jpeg',
    op: 'face',
    expect: { hasFace: true },
    bugClass: 'face extraction (EXIF rotation, largest-face, square crop)',
    notes: 'Single front-side image. Drives extractCedulaFace → Rekognition largest-face → 256×256 crop.',
  },
  {
    id: 'back-image-1',
    mimetype: 'image/jpeg',
    op: 'side',
    expect: { side: 'back' },
    bugClass: 'side detection (back — MRZ/QR/fingerprint, no face)',
    notes: 'Single back-side image. Drives detectCedulaSide → back; no face crop.',
  },
  {
    id: 'unreadable-pdf-synthetic',
    mimetype: 'application/pdf',
    op: 'split',
    expect: { unreadable: true },
    bugClass: 'unreadable/encrypted PDF → {unreadable} marker',
    notes: 'Synthetic corrupt PDF (corpus/synthetic/unreadable.pdf — committed, no PII). Exercises the {unreadable} return path with NO AI/Rekognition call, so this fixture runs in CI without credentials or network.',
  },
]
