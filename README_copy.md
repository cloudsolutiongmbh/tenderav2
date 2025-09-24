# my-convex-app

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Router, Convex, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Router** - File-based routing with full type safety
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **shadcn/ui** - Reusable UI components
- **Convex** - Reactive backend-as-a-service platform
- **Authentication** - Clerk
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
npm install
```

## Convex Setup

This project uses Convex as a backend. You'll need to set up Convex before running the app:

```bash
npm run dev:setup
```

Follow the prompts to create a new Convex project and connect it to your application. See [Convex + Clerk guide](https://docs.convex.dev/auth/clerk) for auth setup.

Then, run the development server:

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
Your app will connect to the Convex cloud backend automatically.





## Project Structure

```
my-convex-app/
â”œâ”€â”€ apps/
â”‚   â”œâ”€â”€ web/         # Frontend application (React + TanStack Router)
â”œâ”€â”€ packages/
â”‚   â””â”€â”€ backend/     # Convex backend functions and schema
â”‚       â”œâ”€â”€ convex/    # Convex functions and schema
â”‚       â””â”€â”€ .env.local # Convex environment variables
```

## Available Scripts

- `npm run dev`: Start all applications in development mode
- `npm run build`: Build all applications
- `npm run dev:web`: Start only the web application
- `npm run dev:setup`: Setup and configure your Convex project
- `npm run check-types`: Check TypeScript types across all apps
