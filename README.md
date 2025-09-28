# Cloud Solution SaaS Starter

A minimal B2B SaaS boilerplate with German UI. Built with React + Vite, TanStack Router, Tailwind + shadcn/ui, Clerk (Auth & Organizations), and Convex. Light theme by default, with a theme toggle.

## Highlights

- Auth & Orgs (Clerk): Sign-in/out (German), User Profile, Organization Profile
- German UI: Navbar, pages, and Clerk localization (`deDE`)
- Light Theme: Default light, theme toggle via next-themes
- Type-safe Routing: TanStack Router with generated route tree
- UI Kit: Tailwind CSS + shadcn/ui components
- Monorepo: Turborepo for apps and packages
- Backend Ready: Convex included (optional to use)

## Quickstart

Prerequisites:
- Node.js 20+ and npm 10+
- Git
- Accounts: Clerk, Convex (optional)

Install dependencies (workspace root):

```bash
npm install
```

Environment variables

- Web app: copy `apps/web/.env.example` → `apps/web/.env`
  - `VITE_CONVEX_URL` (from Convex)
  - `VITE_CLERK_PUBLISHABLE_KEY` (from Clerk)
  - `MAX_UPLOAD_MB` (optional, defaults to 200)

- Backend (Convex): copy `packages/backend/.env.example` → `packages/backend/.env.local`
  - `CONVEX_DEPLOYMENT` and `CONVEX_URL` (from `npx convex dev` or dashboard)
  - `CLERK_JWT_ISSUER_DOMAIN` (from Clerk)
  - `LLM_PROVIDER` (OPENAI | ANTHROPIC)
  - `LLM_MODEL` (e.g., `gpt-4o-mini` or `claude-3-5-sonnet`)
  - `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` (match your provider)
  - `MAX_UPLOAD_MB` (server-side limit; UI reads VITE_MAX_UPLOAD_MB/MAX_UPLOAD_MB)

Run the web app:

```bash
npm run dev:web
```

Open http://localhost:3001

Type check anytime:

```bash
npm run check-types
```

## App Structure

```
apps/
  web/
    src/
      components/
        header.tsx          # Navbar with auth & avatar menu
        mode-toggle.tsx     # Light/Dark toggle (default light)
      routes/
        index.tsx           # Startseite (minimal hero + CTAs)
        profil.tsx          # Clerk <UserProfile /> (routing="hash")
        organisation.tsx    # Clerk <OrganizationProfile /> (routing="hash")
        todos.tsx           # Example page (optional)
packages/
  backend/                  # Convex backend (optional)
```

## Routes

- `/` Startseite (minimal landing, German CTA)
- `/profil` Benutzerprofil (Clerk UserProfile)
- `/organisation` Organisation verwalten (Clerk OrganizationProfile)
- `/todos` Beispiel-Aufgabenliste (kann entfernt werden)

## Theming & Localization

- Default theme: light; users can switch via the toggle.
- Clerk localization: `deDE` via `@clerk/localizations` in `apps/web/src/main.tsx`.

## Customization

- Rename app title/description in `apps/web/src/routes/__root.tsx` and `apps/web/index.html`.
- Adjust navbar links in `apps/web/src/components/header.tsx`.
- Remove `/todos` route and link for a leaner starter.

## Scripts

- `npm run dev` – Run all packages
- `npm run build` – Build all packages
- `npm run dev:web` – Run only the web app on port 3001
- `npm run check-types` – TypeScript checks

## Notes

- Do not commit `.env` files. Use the provided examples.
