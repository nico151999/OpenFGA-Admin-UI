# Copilot Instructions

## Pre-Commit Check Requirement

**IMPORTANT:** After making ANY code changes to this project, you MUST run the check command and fix all issues before considering the task complete:

```bash
bun run check
```

This command runs the following checks in sequence:
1. **Linting** (`biome check .`) - Code quality and style rules
2. **Formatting** (`biome format --write .`) - Code formatting
3. **Type checking** (`tsc --noEmit`) - TypeScript type validation
4. **Dependency check** (`depcheck`) - Unused/missing dependencies
5. **Knip** (`knip`) - Unused exports, files, and dependencies
6. **Outdated** (`bun outdated`) - Check for package updates

## What to do if checks fail

1. **Lint errors**: Fix the code issues reported. Use `bun run lint:fix` for auto-fixable issues.
2. **Format errors**: Run `bun run format` to auto-fix formatting.
3. **Type errors**: Fix TypeScript type issues in the reported files.
4. **Unused dependencies**: Remove them from the appropriate `package.json`.
5. **Unused exports/files**: Remove or mark as intentionally unused (prefix with `_`).
6. **Missing dependencies**: Add them to the appropriate `package.json`.

## Project Structure

This is a monorepo with the following packages:
- `packages/ui` - React frontend (Vite, Ant Design, React Query)
- `packages/gateway` - Hono API gateway (Bun runtime)
- `packages/shared` - Shared types and utilities

## Code Style

- Use Biome for linting and formatting (not ESLint/Prettier)
- TypeScript strict mode is enabled
- Prefer named exports over default exports
- Use `type` imports for type-only imports

## Before Completing Any Task

Always verify your changes work by running:
```bash
bun run check
```

If there are any errors or issues, fix them before marking the task as complete.
