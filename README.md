# @edictus/cedula

Computer vision for Chilean ID cards (*cédula de identidad*). This package
handles four jobs:

- splits photos and scans that show both sides of the card;
- crops the holder's face;
- detects which side a file shows;
- reads the card's fields.

## Highlights

- **Composite split with AI bounding boxes.** A vision model locates the front
  and back cards in a single image as percentage boxes, and `sharp` crops them.
  This replaced an earlier pixel-heuristic splitter.
- **Face crop with AWS Rekognition**, not an LLM guessing coordinates. It picks
  the largest face, which is the main photo and never the small ghost image
  printed beside it, and returns a 256×256 JPEG.
- **Field reading** uses Gemini as the primary model, with Claude Haiku as an
  optional fallback.
- **PDFs are rasterized first**, so every vision step sees an image.
- **One façade per job.** `splitCompositeCedula`, `extractCedulaFace` and
  `detectCedulaSide` each take the raw file and run the whole sequence
  internally: rasterize, detect, split, merge and map errors. The building
  blocks stay private, and there is no persistence or storage coupling.
- **PII-safe regression corpus.** Real card images never enter the repo. What
  is committed is enough to catch regressions when a model or prompt changes:
  - salted hashes of the field values;
  - hashes of the face crops;
  - bounding boxes;
  - a synthetic unreadable PDF.

## Install

```bash
npm i github:luvidal/edictus-cedula#<commit-sha>
```

Server-only. It depends on `sharp`, `pdf-lib`, the Gemini SDK and AWS
Rekognition (it uses the default AWS credential chain plus `AWS_REGION`).

## Usage

```ts
import {
  configure,
  splitCompositeCedula,
  extractCedulaFace,
  detectCedulaSide,
  isUnreadable,
} from '@edictus/cedula'

configure({ doctypes, geminiCall })   // host-injected catalog and authenticated Gemini caller

const split = await splitCompositeCedula(buffer, 'image/jpeg')
if (isUnreadable(split)) {
  // tell the user to retake the photo
} else if (split) {
  const [front, back] = split.parts  // { partId: 'front' | 'back', buffer, docdate, ... }
}

const face = await extractCedulaFace(buffer, 'image/jpeg')  // { face: base64 JPEG, confidence } | null
const side = await detectCedulaSide(buffer, 'image/jpeg')   // { side: 'front' | 'back' | null, confidence }
```

The document-type catalog it expects lives in
[`edictus-document-ai/packages/doctypes`](https://github.com/luvidal/edictus-document-ai/tree/main/packages/doctypes).

## Development

```bash
npm test                  # Vitest, no credentials needed
npm run build             # tsup → dist/ (ESM + CJS + type declarations)
npm run corpus:baseline   # capture the regression baseline (local corpus, Vertex + AWS credentials)
npm run corpus:check      # compare against the committed baseline
```

The corpus harness (`dev/` and `corpus/`) runs from a clone of this repo. The
card images stay on the maintainer's machine; only the PII-safe baseline above
is committed.
