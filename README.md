# OpenFGA Admin Console

A reusable web UI for managing OpenFGA stores, authorization models, and relationship tuples. Built with React, Ant Design, Hono, and Bun.

## Prerequisites

- [Bun](https://bun.sh/) >= 1.0.0
- An OpenFGA instance running (local or remote)

## Quick Start

```bash
# Install dependencies
bun install

# Start development servers (UI + Gateway)
bun run dev

# Or run them separately
bun run dev:ui      # UI at http://localhost:3000
bun run dev:gateway # Gateway at http://localhost:4000
```

## Project Structure

```
openfga-admin-ui/
├── packages/
│   ├── ui/          # React frontend with Ant Design
│   ├── gateway/     # Hono API gateway (Bun runtime)
│   └── shared/      # Shared types and utilities
├── biome.json       # Biome linter/formatter config
├── package.json     # Root workspace config
└── tsconfig.base.json
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start both UI and gateway in development mode |
| `bun run dev:ui` | Start UI development server |
| `bun run dev:gateway` | Start gateway with hot reload |
| `bun run build` | Build all packages |
| `bun run lint` | Run Biome linter |
| `bun run lint:fix` | Fix linting issues |
| `bun run format` | Format code with Biome |
| `bun run typecheck` | Run TypeScript type checking |
| `bun test` | Run tests |

## Tech Stack

### Frontend (`packages/ui`)
- **React 18** - UI framework
- **Ant Design 5** - Component library
- **React Router 6** - Routing
- **TanStack Query** - Server state management
- **Zustand** - Client state management
- **Monaco Editor** - Code editors for DSL/JSON
- **Vite** - Build tool

### Backend (`packages/gateway`)
- **Hono** - Fast web framework
- **Bun** - JavaScript runtime
- **Zod** - Schema validation
- **Pino** - Logging

### Tooling
- **Bun** - Package manager and runtime
- **Biome** - Linting and formatting
- **TypeScript** - Type safety

## Configuration

### Gateway Environment Variables

Create a `.env` file in the root or `packages/gateway`:

```env
PORT=4000
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
NODE_ENV=development
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│   Gateway   │────▶│   OpenFGA   │
│  (React UI) │     │   (Hono)    │     │   Server    │
└─────────────┘     └─────────────┘     └─────────────┘
      │                   │
      │                   ├── SDUI Manifest
      │                   ├── DSL ↔ JSON Transform
      │                   └── Request Proxy
      │
      └── Ant Design Components
          Zustand State
          React Query Cache
```

## Development

### Adding a New Page

1. Create page component in `packages/ui/src/pages/`
2. Add route in `packages/ui/src/App.tsx`
3. Update manifest in `packages/gateway/src/routes/console.ts`

### Adding a New API Endpoint

1. Add route in `packages/gateway/src/routes/`
2. Register in `packages/gateway/src/index.ts`
3. Add types in `packages/shared/src/types/`

## License

Apache-2.0
