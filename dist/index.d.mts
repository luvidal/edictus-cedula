interface DocProcessorLogger {
    error(error: unknown, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
}
/**
 * Optional Gemini call hook. When provided via `configure({ geminiCall })`,
 * every `gemini.models.generateContent` invocation inside this module is
 * routed through it instead of calling the SDK directly. Hosts use this to
 * enforce a process-wide concurrency gate and a typed 429 mapping.
 */
type GeminiCall = (params: {
    model: string;
    contents: any;
    config?: any;
}) => Promise<any>;
declare function configure(options: {
    logger?: DocProcessorLogger;
    doctypes?: Record<string, unknown>;
    geminiCall?: GeminiCall;
}): void;

type ModelArg = 'claude' | 'gemini';
/**
 * Internal result of the V3 composite split (CV leaf). The façade wraps this
 * with rendered-source persistence metadata to produce CompositeCedulaResult.
 */
interface CompositeSplitResult {
    parts: Array<{
        partId: 'front' | 'back';
        buffer: Buffer;
        aiFields: string;
        aiDate: Date | null;
        docdate: string | null;
    }>;
}
/**
 * Public façade result for splitCompositeCedula.
 *
 * Carries the split `parts` PLUS the rendered-source persistence metadata the
 * host needs but can no longer compute itself (rasterize-if-PDF now lives
 * inside the satellite). The host persists PDF cédulas using the RENDERED PNG,
 * not the original PDF — so the dedup `sourceHash` and stored `_original` come
 * from `renderedBuffer`, not from the caller's input buffer. For image input
 * the rendered values equal the input (no rasterization).
 */
interface CompositeCedulaResult extends CompositeSplitResult {
    /** Rasterized page (PDF input) or the original image (image input) — S3 `_original`. */
    renderedBuffer: Buffer;
    /** `'image/png'` for PDF input; the original mimetype for image input. */
    renderedMimetype: string;
    /** `'png'` for PDF input; the caller-supplied extension for image input. */
    renderedExtension: string;
    /** `fileHash(renderedBuffer)` — the dedup hash stored on the front part. */
    sourceHash: string;
}

/**
 * OCR and Document Field Extraction
 *
 * Extracts structured data from uploaded Chilean documents using AI vision
 * models (Gemini Flash primary, Claude Haiku fallback).
 *
 * ## Extraction Strategy
 *
 * ### Images → Split-pass (classifyDocument → extractFields)
 * Same schema contract as PDFs; images just omit page ranges.
 *
 * ### PDFs → Multi-pass (detectDocumentBoundaries → classifyDocument → extractFields)
 * Pass 0 — Split: detect document boundaries in multi-doc PDFs (no doctype knowledge)
 * Pass 1 — Classify: each document individually with doctype definitions + field schemas
 * Pass 2 — Extract: per-type field schemas, parallel across types
 *
 * ## Face Photo Extraction (Cédula)
 * AWS Rekognition via extractFace() — single call, picks largest face.
 */

/**
 * Detect which side of a cedula is shown in an image
 */
declare function detectCedulaSide(buffer: Buffer, mimetype: string, model?: ModelArg): Promise<{
    side: 'front' | 'back' | null;
    confidence: number;
    data?: object;
}>;

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

/**
 * Typed marker returned by `splitCompositeCedula` when PDF input cannot be
 * rendered (encrypted / corrupt). The host maps this to its existing
 * no-clasificado persist path (formerly `unreadablePdfFromError`).
 */
interface UnreadableCedula {
    unreadable: true;
    reason: string;
    encrypted: boolean;
}
declare function isUnreadable(r: CompositeCedulaResult | UnreadableCedula | null): r is UnreadableCedula;
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
declare function splitCompositeCedula(file: Buffer, mimetype: string, model?: ModelArg): Promise<CompositeCedulaResult | UnreadableCedula | null>;
/**
 * Face-extraction façade.
 *
 * Internalizes rasterize-if-PDF → Rekognition largest-face. Replaces the
 * host's if-PDF rasterize branch + `extractFace` in `augmentCedulaFace`.
 *
 * @returns the base64 256×256 face crop + Rekognition confidence, or `null`
 *  when no face is found / the input can't be rendered.
 */
declare function extractCedulaFace(file: Buffer, mimetype: string): Promise<{
    face: string;
    confidence: number;
} | null>;

export { type CompositeCedulaResult, type DocProcessorLogger, type ModelArg, type UnreadableCedula, configure, detectCedulaSide, extractCedulaFace, isUnreadable, splitCompositeCedula };
