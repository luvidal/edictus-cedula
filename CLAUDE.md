# @edictus/cedula — Chilean ID-card (cédula) processing satellite

Standalone computer-vision satellite for Chilean cédulas de identidad: composite
front/back split, face extraction, side detection, and cédula field OCR.
Lift-and-shifted from the cédula surface of the original monolithic `docs` package so cédulas — a CV
problem class, distinct from text-doc extraction — own their own home + corpus.

## Public surface (the façade — Option B)

Each entry takes the RAW file and internalizes the CV sequence
(rasterize-if-PDF → detect → split → merge → error-map). The host never
sequences CV steps and never sees the leaf functions.

- `splitCompositeCedula(file, mimetype, model)` → `CompositeCedulaResult | UnreadableCedula | null`
  Internalizes rasterize-if-PDF → V3 detect/split → front/back field merge.
  Returns `parts` PLUS rendered-source persistence metadata
  (`renderedBuffer` / `renderedMimetype` / `renderedExtension` / `sourceHash`)
  so the host's PDF dedup hash + stored `_original` stay byte-identical. Returns
  `{ unreadable }` on unrenderable PDF input (host → no-clasificado), `null`
  when not a composite. 429s from the gated Gemini caller bubble.
- `extractCedulaFace(file, mimetype)` → `{ face, confidence } | null`
  Rasterize-if-PDF → Rekognition largest-face → 256×256 crop.
- `detectCedulaSide(file, mimetype, model)` → `{ side, confidence, data? }`
- `isUnreadable(r)` type guard; `configure({ doctypes, geminiCall, logger })`.

**INTERNAL — never exported:** `extractPdfPageAsImage`,
`detectAndSplitCompositeCedulaV3` (raw), `extractFace` (raw),
`detectAndSplitCompositeCedula` (V1), `mergeCedulaFiles`, `Doc2Fields`, ocr
helpers. The corpus harness imports these directly to stay self-debuggable.

## Host wiring (black-box invariant)

Nothing here touches Prisma/S3. The host injects the gated Gemini caller +
doctype catalog from `lib/server/docsinit.ts`:
`configure({ doctypes, geminiCall: geminiGenerate, logger })`. Cédula OCR (front/
back Doc2Fields inside the V3 split) routes through the injected `geminiCall`
so it shares the host's in-process semaphore (no 429 storm). Without it, ai.ts
falls back to a `GEMINI_API_KEY` SDK client (CLI/standalone only).

## Regression corpus (fixtures-first safety net)

`corpus/` owns the safety net. Image bytes (`corpus/images/`), the id→filename
map, the salt, and cleartext field values are **gitignored** (maintainer-local).
Committed: `manifest.ts`, `baseline.json` (PII-safe — salted field hashes +
face-crop SHAs + bbox), the synthetic unreadable PDF, and the runners.

- `npm run corpus:baseline` — capture baseline from the current pipeline.
- `npm run corpus:check` — re-run + diff vs baseline; prints cleartext locally.
  Structural fields (partIds, rendered metadata, side, unreadable) + face crop
  (for `face`/`side` ops) are hard-asserted; `split`-path face/bbox + Gemini
  field hashes are informational (model non-determinism). Both need Jogi
  credentials (Vertex + AWS) sourced from `/Users/avd/GitHub/jogi/.env.local`.

`dev/` + `corpus/` are source-clone-only — the published artifact ships just
`dist` (`files: ["dist"]`), and image bytes are gitignored, so the harness runs
HERE (this clone), never from a consumer's `node_modules/@edictus/cedula`.

## Tech stack & rules

- Node.js (server-only, no React). Build: tsup (CJS+ESM+dts). Tests: vitest.
- Image: sharp. Faces: AWS Rekognition. PDF: pdf-lib, pdf-to-png-converter. AI: Gemini (Vertex via injected caller) / Claude fallback.
- File naming lowercase; relative imports within `src/`; errors via `getLogger()`, never import Sentry.
- After changing a behavior, update this file + add/extend a corpus fixture.

## Validation

`npx tsc --noEmit && npm test`. `npm test` runs WITHOUT credentials (the
unreadable-PDF path + the pure merge tests); full parity is the local
`corpus:check` step.

## Consumer integration

Consumed by Jogi via pinned GitHub SHA (never `#main`, never `file:`):
`@edictus/cedula@github:luvidal/edictus-cedula#<SHA>` · `npm run update:cedula`.
