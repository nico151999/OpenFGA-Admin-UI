# OpenFGA Admin Console

You can think of this as the UI Layer for OpenFGA that gives Admins the ability to manage it without much knowledge about APIs or CLI

The project was created an Admin UI for OpenFGA, The main goal is that the UI is Dynamic and it changes as per your OpenFGA Model, Then you can Easily Add users 

So it is built because we constantly struggling with managing permissions in our applications. we tried building admin UIs multiple times, but every time the OpenFGA model changed, we had to rework the UI layer to match it one way or another.

It do have reusable web UI components for managing OpenFGA stores, authorization models, and relationship tuples.

<img width="2557" height="1156" alt="Screenshot 2026-01-26 at 5 03 10 PM" src="https://github.com/user-attachments/assets/7c28a0f9-0aa5-46e3-8514-6d66385ce168" />

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

## Screenshots

<img width="2552" height="1157" alt="Screenshot 2026-01-26 at 5 01 33 PM" src="https://github.com/user-attachments/assets/4e7bec20-3ff1-4554-8957-5a4306e3a7c5" />
<img width="2551" height="962" alt="Screenshot 2026-01-26 at 5 01 48 PM" src="https://github.com/user-attachments/assets/67bae2c8-3667-48a2-bf46-1fae41044aa0" />
<img width="2555" height="1155" alt="Screenshot 2026-01-26 at 5 02 05 PM" src="https://github.com/user-attachments/assets/bf04b30c-000e-44bc-97d1-353fedfc44e4" />
<img width="2557" height="1141" alt="Screenshot 2026-01-26 at 5 02 20 PM" src="https://github.com/user-attachments/assets/52662f20-b994-4fa9-8fd3-7e1037a12793" />
<img width="2558" height="1147" alt="Screenshot 2026-01-26 at 5 02 27 PM" src="https://github.com/user-attachments/assets/16829e08-257c-4670-bb33-eba11d19288d" />
<img width="2557" height="1153" alt="Screenshot 2026-01-26 at 5 02 52 PM" src="https://github.com/user-attachments/assets/767dfc86-6419-4edc-8a59-ecae14d25a33" />
<img width="2556" height="1156" alt="Screenshot 2026-01-26 at 5 03 01 PM" src="https://github.com/user-attachments/assets/dd6a472e-3ffa-4a94-affc-e91b532ba007" />


