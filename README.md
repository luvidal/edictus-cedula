# @jogi/cedula

Chilean ID-card (cédula de identidad) processing satellite — composite front/back
split, face extraction, side detection, and cédula field OCR. A computer-vision
problem class split out of `@jogi/docs` so it owns its own regression corpus.

## Public surface

```ts
import {
  splitCompositeCedula,   // raw file → { parts, renderedBuffer, renderedMimetype, renderedExtension, sourceHash } | { unreadable } | null
  extractCedulaFace,      // raw file → { face, confidence } | null   (256×256 base64 JPEG)
  detectCedulaSide,       // raw file → { side, confidence, data? }
  isUnreadable,           // type guard for the {unreadable} marker
  configure,              // configure({ doctypes, geminiCall, logger })
} from '@jogi/cedula'
```

Each façade takes the raw file and internalizes the CV sequence
(rasterize-if-PDF → detect → split → merge → error-map). Leaf CV functions stay
internal. The satellite never touches Prisma/S3 — persistence, no-clasificado
mapping, and classification gating stay in the host.

## Host integration

Wired from `lib/server/docsinit.ts`:
`configure({ doctypes, geminiCall: geminiGenerate, logger })`. Consumed via a
pinned GitHub SHA (`npm run update:cedula`), never `#main` or `file:`.

## Commands

- `npm run build` — bundle `dist/` (CJS + ESM + types).
- `npm test` — vitest (runs without credentials).
- `npm run corpus:baseline` / `npm run corpus:check` — capture/verify the
  regression corpus locally (needs Jogi Vertex + AWS credentials; see CLAUDE.md).

## Regression corpus

Image bytes, the id→filename map, the salt, and cleartext field values are
gitignored (maintainer-local). Only PII-safe baselines (salted field hashes,
face-crop SHAs, bbox) + a synthetic unreadable PDF + the runners are committed.

> The corpus harness (`dev/` + `corpus/`) is a **source-clone tool**, run from
> this repo at `~/GitHub/jogi@cedula`. The published artifact ships only `dist`
> (`files: ["dist"]`), so `corpus:baseline` / `corpus:check` do **not** run from
> a consumer's `node_modules/@jogi/cedula` — and couldn't anyway, since the
> image bytes are gitignored and live only on the maintainer's machine. Debug a
> cédula regression by working in this clone, where everything is present.
