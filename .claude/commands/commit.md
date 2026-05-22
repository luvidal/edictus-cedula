Review all uncommitted changes in git. Understand what each changed file does, group related changes, and create clear commit(s).

## Workflow

### Phase 1: Understand
1. `git diff --staged` and `git diff` to see all changes
2. `git status` for untracked files
3. Read enough context to understand the purpose of each change

### Phase 2: Validate (parallel)
1. Run `npm test` — all tests must pass
2. Run `npx tsc --noEmit` — no type errors
3. Run `npm run build` — build must succeed

### Phase 3: Commit
1. Stage related changes together
2. Write clear commit messages (imperative mood, explain WHY not WHAT)
3. Create the commit(s)

## Rules
- NEVER amend previous commits unless explicitly asked
- Fix any test/build failures before committing
- Don't push unless asked
