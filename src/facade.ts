/**
 * Public façade — Option B orchestration.
 *
 * The host no longer sequences the cédula CV steps. Each entry point here
 * takes the raw file and internalizes the full sequence
 * (rasterize-if-PDF → detect → split → merge → error-map). The leaf CV
 * functions (detectAndSplitCompositeCedulaV3, extractFace,
 * extractPdfPageAsImage) stay internal and are never re-exported.
 *
 * Black-box invariant: nothing here touches Prisma or S3. Persistence,
 * no-clasificado mapping, classification gating, and cross-stage placement
 * stay in the host.
 */

import { createHash } from 'crypto'
import { extractPdfPageAsImage } from './ocr'
import { detectAndSplitCompositeCedulaV3 } from './cedulasplit'
import { extractFace } from './faceextract'
import type { CompositeCedulaResult, ModelArg } from './types'

/** SHA-256 of raw bytes — mirrors the host's `lib/domain/aicache.ts fileHash`. */
function fileHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

/** Map an image mimetype to a stored-file extension. */
function extensionForMimetype(mimetype: string): string {
  switch (mimetype) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    default:
      return mimetype.split('/')[1] || 'jpg'
  }
}

/**
 * Typed marker returned by `splitCompositeCedula` when PDF input cannot be
 * rendered (encrypted / corrupt). The host maps this to its existing
 * no-clasificado persist path (formerly `unreadablePdfFromError`).
 */
export interface UnreadableCedula {
  unreadable: true
  reason: string
  encrypted: boolean
}

export function isUnreadable(
  r: CompositeCedulaResult | UnreadableCedula | null,
): r is UnreadableCedula {
  return r != null && (r as UnreadableCedula).unreadable === true
}

/**
 * Composite split façade.
 *
 * Internalizes: rasterize-if-PDF → V3 detect/split → front/back field merge.
 * Replaces the host's `extractPdfPageAsImage` + `detectAndSplitCompositeCedulaV3`
 * (+ the `unreadablePdfFromError` rasterize error-map) dance.
 *
 * @returns
 *  - `CompositeCedulaResult` when the input is a composite cédula (carries
 *    `parts` plus the rendered-source persistence metadata the host needs);
 *  - `{ unreadable }` when PDF input can't be rendered (host → no-clasificado);
 *  - `null` when the input is not a composite cédula (host continues pipeline).
 *
 * Rate-limit (429) errors from the gated Gemini caller bubble so the host can
 * surface `ai_busy`.
 */
export async function splitCompositeCedula(
  file: Buffer,
  mimetype: string,
  model: ModelArg = 'gemini',
): Promise<CompositeCedulaResult | UnreadableCedula | null> {
  let renderedBuffer: Buffer
  let renderedMimetype: string
  let renderedExtension: string

  if (mimetype === 'application/pdf') {
    const pageImage = await extractPdfPageAsImage(file, 1)
    if (!pageImage) {
      // The satellite owns its PDF library; an encrypted/unreadable PDF it
      // can't render is not a composite-detection bug — surface the typed
      // marker so the host falls through to its no-clasificado persist path.
      return { unreadable: true, reason: 'pdf-render-failed', encrypted: false }
    }
    renderedBuffer = pageImage
    renderedMimetype = 'image/png'
    renderedExtension = 'png'
  } else {
    renderedBuffer = file
    renderedMimetype = mimetype
    renderedExtension = extensionForMimetype(mimetype)
  }

  const split = await detectAndSplitCompositeCedulaV3(renderedBuffer, renderedMimetype, model)
  if (!split) return null

  return {
    ...split,
    renderedBuffer,
    renderedMimetype,
    renderedExtension,
    sourceHash: fileHash(renderedBuffer),
  }
}

/**
 * Face-extraction façade.
 *
 * Internalizes rasterize-if-PDF → Rekognition largest-face. Replaces the
 * host's if-PDF rasterize branch + `extractFace` in `augmentCedulaFace`.
 *
 * @returns the base64 256×256 face crop + Rekognition confidence, or `null`
 *  when no face is found / the input can't be rendered.
 */
export async function extractCedulaFace(
  file: Buffer,
  mimetype: string,
): Promise<{ face: string; confidence: number } | null> {
  let imageBuffer: Buffer | null = null
  if (mimetype.startsWith('image/')) {
    imageBuffer = file
  } else if (mimetype === 'application/pdf') {
    imageBuffer = await extractPdfPageAsImage(file, 1)
  }
  if (!imageBuffer) return null

  const result = await extractFace(imageBuffer)
  if (!result) return null
  return { face: result.face, confidence: result.confidence }
}

// Side detection is already file-level (it internalizes rasterize-if-PDF) —
// re-exported unchanged.
export { detectCedulaSide } from './ocr'
