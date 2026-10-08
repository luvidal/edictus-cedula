# @edictus/cedula

[English](README.md) · **Español**

Visión por computador para cédulas de identidad chilenas. Este paquete hace
cuatro cosas:

- separa fotos y escaneos que muestran ambos lados de la cédula;
- recorta la cara del titular;
- detecta qué lado muestra un archivo;
- lee los campos de la cédula.

## Lo destacado

- **Separación con cuadros delimitadores de IA.** Un modelo de visión ubica el
  frente y el reverso dentro de una misma imagen como cuadros en porcentaje, y
  `sharp` los recorta. Esto reemplazó un separador anterior basado en
  heurísticas de píxeles.
- **Recorte de la cara con AWS Rekognition**, no con un LLM adivinando
  coordenadas. Elige la cara más grande, que es la foto principal y nunca la
  imagen fantasma pequeña impresa al lado, y devuelve un JPEG de 256×256.
- **Lectura de campos** con Gemini como modelo principal y Claude Haiku como
  respaldo opcional.
- **Los PDF se rasterizan primero**, así cada paso de visión trabaja sobre una
  imagen.
- **Una función por tarea.** `splitCompositeCedula`, `extractCedulaFace` y
  `detectCedulaSide` reciben el archivo tal cual y ejecutan toda la secuencia
  por dentro: rasterizar, detectar, separar, combinar y traducir errores. Las
  piezas internas no se exponen, y no hay acoplamiento con persistencia ni
  almacenamiento.
- **Corpus de regresión sin datos personales.** Las imágenes de cédulas reales
  nunca entran al repo. Lo que se sube basta para detectar regresiones cuando
  cambia un modelo o un prompt:
  - hashes con sal de los valores de los campos;
  - hashes de los recortes de cara;
  - cuadros delimitadores;
  - un PDF sintético ilegible.

## Instalación

```bash
npm i github:luvidal/edictus-cedula#<sha-del-commit>
```

Solo para servidor. Depende de `sharp`, `pdf-lib`, el SDK de Gemini y AWS
Rekognition (usa la cadena de credenciales por defecto de AWS más
`AWS_REGION`).

## Uso

```ts
import {
  configure,
  splitCompositeCedula,
  extractCedulaFace,
  detectCedulaSide,
  isUnreadable,
} from '@edictus/cedula'

configure({ doctypes, geminiCall })   // catálogo y cliente de Gemini autenticado, inyectados por la aplicación

const split = await splitCompositeCedula(buffer, 'image/jpeg')
if (isUnreadable(split)) {
  // pedirle al usuario que vuelva a tomar la foto
} else if (split) {
  const [front, back] = split.parts  // { partId: 'front' | 'back', buffer, docdate, ... }
}

const face = await extractCedulaFace(buffer, 'image/jpeg')  // { face: JPEG en base64, confidence } | null
const side = await detectCedulaSide(buffer, 'image/jpeg')   // { side: 'front' | 'back' | null, confidence }
```

El catálogo de tipos de documento que espera está en
[`edictus-document-ai/packages/doctypes`](https://github.com/luvidal/edictus-document-ai/tree/main/packages/doctypes).

## Desarrollo

```bash
npm test                  # Vitest, sin credenciales
npm run build             # tsup → dist/ (ESM + CJS + declaraciones de tipos)
npm run corpus:baseline   # captura la línea base de regresión (corpus local, credenciales de Vertex + AWS)
npm run corpus:check      # compara contra la línea base del repo
```

El arnés del corpus (`dev/` y `corpus/`) se ejecuta desde un clon de este repo.
Las imágenes de cédulas quedan en el computador del mantenedor; al repo solo se
sube la línea base sin datos personales descrita arriba.
