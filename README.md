# OpenFGA Admin Console

You can think of this as the UI Layer for OpenFGA that gives Admins the ability to manage it without much knowledge about APIs or CLI

It do have reusable web UI components for managing OpenFGA stores, authorization models, and relationship tuples.

## What You Can Do with this UI

Connect to OpenFGA: You can connect to any OpenFGA instance (local or remote) and manage multiple stores from a single interface.

Dashboard: Get an overview of everything about your OpenFGA (stores, models, and tuple counts) .

Model Browser and Model Editor where you can:
- Visualize your authorization model as an interactive graph
- Understand relationships between types and permissions at a glance
- Write and edit authorization models using the OpenFGA DSL
- Syntax highlighting and validation
- Compare model versions with visual diff

Tuple Manager:
- Create, view, and delete relationship tuples
- Search and filter tuples by type, object, or user
- Bulk operations support

Access Explorer:
- Test authorization queries (`check`, `list-objects`, `list-users`)
- Debug access decisions in real-time
- Understand why access is granted or denied

Hierarchy Manager & Grouped Permissions:
- Manage hierarchical relationships (e.g., org → team → user)
- Visual tree view of your data hierarchy

OpenFGA Changes Feed:
- View audit log of all changes to your authorization data
- Track who changed what and when

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

## License

Apache-2.0
