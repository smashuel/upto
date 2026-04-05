---
name: build-check
description: Run TypeScript type checking and ESLint, then fix any errors found
---

# Build & Lint Check

Run the full build validation pipeline and fix issues.

## Steps

1. **TypeScript check**: Run `npx tsc --noEmit` and capture all errors
2. **ESLint check**: Run `npm run lint` and capture all warnings/errors
3. **Analyze results**: Categorize errors by type and severity
4. **Fix errors**: For each error, read the relevant file, understand the context, and apply the fix
5. **Re-run checks**: After fixing, run both checks again to confirm everything passes

## Rules

- Fix type errors by adding proper types, not by using `any` or `@ts-ignore`
- For lint errors, follow the project's existing ESLint configuration
- If a fix requires a design decision, ask the user before proceeding
- Report a summary of what was found and what was fixed
