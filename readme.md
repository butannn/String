# String Canvas

Minimalist React + Vite app with a large blank canvas where each user can add and connect text, image, audio, and video elements.

## Implemented in this pass

- Username/password auth UX on top of Supabase Auth.
- TanStack Router routes: `/`, `/login`, `/app`.
- User-owned multi-canvas model.
- Top canvas selector shown when a user has multiple canvases.
- Create canvas action and logout with confirmation.
- Canvas editor with:
  - Large blank world area.
  - Zoom in/out.
  - Scroll in all directions.
  - Add text/photos/voice/videos.
  - Element select actions: move, delete, attach.
  - Attach mode zooms out and then links to a second element.
  - Duplicate attachment protection.
  - Connection lines are black 2px and keep constant visual width at all zoom levels.
- Supabase SQL migration script in `supabase/schema.sql`.
- shadcn-compatible UI layer and shadcn MCP config in `.mcp.json`.

## Stack

- React + Vite + TypeScript
- TanStack Router
- Supabase (Auth, Postgres, Storage)
- Supabase Data API (PostgREST /rest/v1) for table CRUD
- Tailwind CSS v4
- Radix primitives + shadcn-style components

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env
```

3. Set values in `.env`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_STORAGE_S3_ENDPOINT`
- `VITE_SUPABASE_STORAGE_BUCKET` (default: `canvas-media`)
- `VITE_SUPABASE_ANON_KEY`

4. Apply database schema in Supabase SQL editor:

- Run `supabase/schema.sql`.

5. Create storage bucket in Supabase dashboard:

- Bucket name: `canvas-media`
- Visibility: private
- Suggested object path: `canvases/{canvas_id}/media/{filename}`
- Or run `supabase/storage_setup.sql` in SQL editor to create bucket + policies automatically.

6. Configure Auth for username-only flow (important):

- Go to Supabase Dashboard -> Authentication -> Providers -> Email.
- Turn off `Confirm email` so signup does not depend on outbound email delivery.
- This app still stores an internal synthetic email for Supabase Auth, but users only type username + password.

7. Run the app:

```bash
npm run dev
```

## shadcn MCP server

This repo includes `.mcp.json` with a `shadcn` server entry:

```json
{
  "mcpServers": {
    "shadcn": {
      "command": "npx",
      "args": ["shadcn@latest", "mcp"]
    }
  }
}
```

If your MCP client needs local setup, point it to the same command and args.

## Database notes

The schema includes:

- `profiles`
- `canvases`
- `canvas_elements`
- `element_attachments`
- `media_assets`

With:

- RLS policies scoped to `auth.uid()`.
- Soft delete columns via `deleted_at`.
- `updated_at` triggers.
- Duplicate attachment blocking with `(canvas_id, pair_min, pair_max)` unique index for active rows.

## Current MVP constraints

- Coordinates are non-negative in DB checks.
- Canvas is very large and can grow, but not mathematically infinite.
- No real-time multi-user collaboration yet.
