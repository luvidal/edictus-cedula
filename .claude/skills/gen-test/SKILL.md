Generate unit tests for the specified module.

## Conventions
- Test location: `tests/` directory
- File naming: `<module>.test.ts`
- Framework: vitest
- No `@/` aliases — use relative imports from `../src/`
- Import from vitest: `import { describe, it, expect, vi } from 'vitest'`
- Mock external deps (AI SDKs, sharp) with `vi.mock()`
- Use fixture files from `tests/fixtures/` when needed
