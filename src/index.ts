// @jogi/cedula — server-only entry point (heavy deps: sharp, AI SDKs, pdf-lib,
// AWS Rekognition).
//
// PUBLIC SURFACE = the three per-operation façades + configure + the public
// result types. The leaf CV functions (extractPdfPageAsImage,
// detectAndSplitCompositeCedulaV3, extractFace, V1 split, mergeCedulaFiles,
// ocr helpers) stay INTERNAL — the satellite's debug harness uses them
// directly; the host never sees them.

// Host wiring: configure({ doctypes, geminiCall, logger }). Doc2Fields (run
// inside the V3 split) needs the doctype catalog; cédula OCR routes through
// the host-injected gated geminiCall (in-process semaphore, typed 429 map).
export { configure } from './config'
export type { DocProcessorLogger } from './config'

// Façade (Option B): each entry takes the raw file and internalizes the CV
// sequence. No single processCedula — the three operations fire at different
// upload-lifecycle moments.
export { splitCompositeCedula, extractCedulaFace, detectCedulaSide, isUnreadable } from './facade'
export type { UnreadableCedula } from './facade'

// Public types
export type { ModelArg, CompositeCedulaResult } from './types'
