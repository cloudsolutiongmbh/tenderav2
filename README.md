# tendera.ch

**AI-powered tender analysis for Swiss public procurement**

Tendera streamlines the analysis of public tender documents (Pflichtenheft, Ausschreibungen) by automatically extracting key requirements, milestones, and criteria using large language models. Built for efficiency, compliance, and multi-tenant organizations.

---

## 🎯 What is Tendera?

Tendera is a modern web application designed for companies responding to Swiss public tenders. It automates the tedious task of analyzing lengthy tender specifications by:

- **Extracting key information**: Automatically identifies deadlines, requirements, eligibility criteria, and open questions from PDF/DOCX documents
- **Criteria-based analysis**: Checks tender offers against custom templates with mandatory (Muss) and optional (Kann) criteria
- **Multi-offer comparison** *(in development)*: Compare multiple vendor offers side-by-side against extracted criteria
- **Collaborative workflows**: Organization-based tenancy with shared templates and project management
- **Export & sharing**: Generate PDF reports and create time-limited share links for stakeholders

### Key Features

✅ **Standard Analysis** - Automatic extraction of summary, milestones, requirements, eligibility criteria, and metadata
✅ **Criteria Analysis** - Custom template-based evaluation with evidence citations
✅ **Document Management** - Upload and process PDF, DOCX, and TXT files (client-side extraction)
✅ **Template System** - Reusable criteria catalogs with flexible weighting and answer types
✅ **Live Status Tracking** - Real-time analysis progress with reactive UI updates
✅ **PDF Export** - Print-optimized reports with full citation preservation
✅ **Secure Sharing** - Time-limited read-only access for external stakeholders
✅ **Comments & Tasks** - Project-specific collaboration tools

---

## 🏗️ Architecture

### Tech Stack

**Frontend:**
- **React 18** + **Vite** - Fast development and optimized builds
- **TanStack Router** - Type-safe file-based routing
- **Tailwind CSS** + **shadcn/ui** - Beautiful, accessible components
- **Clerk** - Authentication and organization management

**Backend:**
- **Convex** - Real-time database with live queries
- **LLM Integration** - OpenAI GPT / Anthropic Claude with provider switching
- **Server Actions** - Document extraction and AI analysis workflows

**Key Libraries:**
- `pdfjs-dist` - Client-side PDF text extraction
- `mammoth` - DOCX to text conversion
- `zod` - Runtime schema validation for LLM outputs
- `sonner` - Toast notifications

### Project Structure

```
tenderav2/
├── apps/
│   └── web/                          # React web application
│       ├── src/
│       │   ├── components/
│       │   │   ├── analysis-cards/   # Summary, milestones, requirements display
│       │   │   ├── criteria-panel/   # Criteria list and detail views
│       │   │   ├── ui/               # shadcn/ui component library
│       │   │   ├── app-sidebar.tsx   # Main navigation sidebar
│       │   │   ├── status-badge.tsx  # Analysis status indicators
│       │   │   ├── upload-dropzone.tsx
│       │   │   └── ...
│       │   ├── routes/
│       │   │   ├── __root.tsx        # Root layout with sidebar
│       │   │   ├── index.tsx         # Landing page
│       │   │   ├── projekte.tsx      # Projects list with search/filter
│       │   │   ├── projekte.$id.standard.tsx
│       │   │   ├── projekte.$id.kriterien.tsx
│       │   │   ├── projekte.$id.dokumente.tsx
│       │   │   ├── projekte.$id.kommentare.tsx
│       │   │   ├── projekte.$id.export.tsx
│       │   │   ├── templates.tsx     # Template management
│       │   │   ├── templates.$id.tsx
│       │   │   └── share.$token.tsx  # Public share view
│       │   ├── hooks/
│       │   │   └── useOrgAuth.ts     # Organization auth helpers
│       │   └── lib/
│       │       └── extract-text.ts   # Client-side document extraction
│       └── index.html
├── packages/
│   └── backend/                      # Convex backend
│       └── convex/
│           ├── schema.ts             # Database schema definition
│           ├── auth.ts               # Auth helpers (getIdentityOrThrow)
│           ├── projects.ts           # Project CRUD and analysis triggers
│           ├── documents.ts          # File upload and management
│           ├── docPages.ts           # Extracted text storage
│           ├── templates.ts          # Criteria template management
│           ├── analysis.ts           # LLM analysis actions
│           ├── llm.ts                # Provider abstraction layer
│           ├── comments.ts           # Project comments
│           ├── shares.ts             # Share link generation
│           └── healthCheck.ts        # Health monitoring
├── tasks.md                          # Development roadmap (Phases 0-14)
├── MILESTONE_OFFERTEN_VERGLEICH.md   # Multi-offer comparison plan
└── README.md                         # This file
```

---

## 📚 Documentation

**Comprehensive documentation available for developers and code reviewers:**

| Document | Purpose | Audience |
|----------|---------|----------|
| **[DOCS_INDEX.md](./DOCS_INDEX.md)** | 📖 Complete documentation index | All |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | System architecture and design | Developers, Architects |
| **[DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)** | Database schema with ERD | Backend Developers |
| **[API_REFERENCE.md](./API_REFERENCE.md)** | Backend API documentation | Frontend Developers |
| **[LLM_INTEGRATION.md](./LLM_INTEGRATION.md)** | LLM prompts and strategies | AI Engineers |
| **[SECURITY_AND_ISSUES.md](./SECURITY_AND_ISSUES.md)** | ⚠️ Security model + known issues | Security, Management |
| **[SETUP_AND_DEPLOYMENT.md](./SETUP_AND_DEPLOYMENT.md)** | Setup and deployment guide | Developers, DevOps |

**⚠️ For External Code Reviewers:** Start with [DOCS_INDEX.md](./DOCS_INDEX.md), then review [SECURITY_AND_ISSUES.md](./SECURITY_AND_ISSUES.md) for critical issues.

---

## 🚀 Getting Started

### Quickstart

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Copy environment templates**
   ```bash
   cp apps/web/.env.example apps/web/.env
   # Create packages/backend/.env.local and paste the backend snippet below
   ```
3. **Configure keys**
   - Clerk: enable Organisations, create a `convex` JWT template and copy the publishable key + issuer domain
   - Convex: run `npm run dev:server` once to bootstrap the deployment and `.env.local`
   - LLM: set `LLM_PROVIDER`, `LLM_MODEL`, and matching API key (OpenAI or Anthropic)
4. **Start the Convex backend**
   ```bash
   npm run dev:server
   ```
5. **Start the web app** (new terminal)
   ```bash
   npm run dev:web
   ```
6. Visit [http://localhost:3001](http://localhost:3001) and sign in with Clerk.

### Prerequisites

- **Node.js** 20+ and **npm** 10+
- **Git**
- **Accounts**:
  - [Clerk](https://clerk.com) - For authentication
  - [Convex](https://convex.dev) - For backend database
  - [OpenAI](https://openai.com) or [Anthropic](https://anthropic.com) - For LLM access

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/cloudsolutiongmbh/tenderav2.git
   cd tenderav2
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**

   **Web app** (`apps/web/.env`):
   ```env
   VITE_CONVEX_URL=https://your-deployment.convex.cloud
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
   VITE_MAX_UPLOAD_MB=200
   ```

   **Backend** (`packages/backend/.env.local`):
   ```env
   # Convex (auto-generated by npx convex dev)
   CONVEX_DEPLOYMENT=prod:your-deployment
   CONVEX_URL=https://your-deployment.convex.cloud

   # Clerk
   CLERK_JWT_ISSUER_DOMAIN=your-clerk-domain.clerk.accounts.dev

   # LLM Provider (choose one)
   LLM_PROVIDER=OPENAI              # or ANTHROPIC
   LLM_MODEL=gpt-4o-mini            # or claude-3-5-sonnet-20241022
   OPENAI_API_KEY=sk-...            # if using OpenAI
   ANTHROPIC_API_KEY=sk-ant-...     # if using Anthropic

   # Analysis configuration
   CONVEX_MAX_ACTIVE_RUNS_PER_ORG=1
   MAX_UPLOAD_MB=200
   ```

4. **Set up Clerk**
   - Create a Clerk application at [clerk.com](https://clerk.com)
   - Enable **Organizations** feature
   - Create a JWT template named `convex` with claim `org_id` → `{{org.id}}`
   - Copy publishable key to `VITE_CLERK_PUBLISHABLE_KEY`
   - Copy JWT issuer domain to `CLERK_JWT_ISSUER_DOMAIN`

5. **Set up Convex**
   ```bash
   npm run dev:server
   ```
   This wraps `convex dev` and will:
   - Create a Convex deployment (on first run)
   - Generate/refresh `packages/backend/.env.local` with deployment details
   - Deploy the schema and watch for changes

6. **Run the web application** (in a separate terminal while the backend keeps running)
   ```bash
   npm run dev:web
   ```
   Then open [http://localhost:3001](http://localhost:3001).

---

## 📖 Usage Guide

### 1. Create a Project

1. Navigate to **Projekte** in the sidebar
2. Click **Neues Projekt**
3. Fill in:
   - **Projektname** (e.g., "Stadt Zürich Infrastruktur 2025")
   - **Kunde/Behörde** (e.g., "Stadt Zürich, Tiefbauamt")
   - **Interne Tags** (optional, comma-separated)
   - **Template** (optional, for criteria analysis)
4. Click **Projekt anlegen**

### 2. Upload Documents

1. Go to **Dokumente** tab
2. Drag & drop or click to upload:
   - Supported formats: **PDF**, **DOCX**, **TXT**
   - Max total size: 200 MB (configurable)
3. Wait for extraction (happens client-side)
4. Click **Standard-Analyse starten** or **Kriterien-Analyse starten**

### 3. View Standard Analysis Results

Navigate to **Standard-Ansicht** to see:
- **Executive Summary** (200-300 words)
- **Milestones & Deadlines** with citations
- **Requirements** (functional and non-functional)
- **Eligibility Criteria** and **Exclusion Criteria**
- **Open Questions** and unclear points
- **Metadata** (tender ID, authority, budget, etc.)

All items include **page citations** with quotes from source documents.

### 4. Run Criteria Analysis

1. Ensure project has a **template** assigned (select one or create new)
2. Go to **Kriterien-Ansicht**
3. Click **Analyse starten**
4. Review results:
   - **Left panel**: List of criteria with status (✓ Found / ✗ Not found / ~ Partial)
   - **Right panel**: Selected criterion details with evidence citations and LLM commentary

### 5. Create and Manage Templates

1. Navigate to **Templates** in sidebar
2. Click **Neues Template**
3. Define criteria:
   - **Titel** and **Beschreibung**
   - **Antworttyp**: Boolean / Skala (1-5) / Text
   - **Gewicht**: 0-100 (importance)
   - **Pflicht**: Mandatory (Muss) or optional (Kann)
   - **Keywords** (optional, for better LLM matching)
4. Save and reuse across projects

### 6. Export and Share

**PDF Export:**
- Go to **Export** tab
- Click **Als PDF exportieren**
- Browser print dialog opens with optimized layout

**Share Link:**
- Click **Link teilen**
- Set expiration (7, 14, 30 days, or custom)
- Copy generated link
- Share with stakeholders (no login required, read-only)

---

## 🔧 Development

### Available Scripts

```bash
# Development
npm run dev                # Run web + backend via Turborepo
npm run dev:web            # Run only the web app (port 3001)
npm run dev:server         # Run Convex backend in watch mode
npm run dev:e2e            # Start mocked backend + web app for E2E runs

# Build
npm run build              # Build all packages (Turbo)

# Type Checking
npm run check-types        # TypeScript validation across all packages

# Tests
npm run test:unit          # Vitest suite
npm run test:e2e           # Playwright suite (expects dev:e2e stack)

# Convex
npx convex dev             # Start Convex in development mode
npx convex deploy          # Deploy to production
npx convex dashboard       # Open Convex dashboard
```

### Project Configuration

**Turborepo** (`turbo.json`):
- Parallel builds and caching
- Development tasks in watch mode

**TypeScript** (`tsconfig.json`):
- Strict mode enabled
- Path aliases (`@/` → `src/`)

**Vite** (`apps/web/vite.config.ts`):
- React SWC for fast refresh
- Port 3001 by default

### Database Schema

See `packages/backend/convex/schema.ts` for full schema definition.

**Key tables:**
- `projects` - Project metadata and organization scoping
- `documents` - Uploaded files with storage references
- `docPages` - Extracted text per page
- `templates` - Reusable criteria catalogs
- `analysisRuns` - Analysis job tracking with telemetry
- `analysisResults` - Structured LLM outputs (standard/criteria)
- `shares` - Time-limited share tokens
- `comments` - Project-scoped collaboration

**Indexes:**
- All tables indexed by `orgId` for multi-tenancy
- Composite indexes for common queries (projectId, documentId, etc.)

### LLM Integration

**Provider Switching** (`packages/backend/convex/llm.ts`):
```typescript
// Supports OpenAI and Anthropic with unified interface
const response = await callLLM({
  systemPrompt: "Du bist Experte für öffentliche Ausschreibungen...",
  userPrompt: "Extrahiere folgende Informationen...",
  temperature: 0.3,
});
```

**Prompt Engineering** (`packages/backend/convex/analysis.ts`):
- German-language prompts
- Strict JSON schema enforcement
- Mandatory citation requirement (page + quote)
- Anti-hallucination instructions ("Antworte nur aus den bereitgestellten Seiten")
- Zod validation for LLM outputs

**Telemetry** (stored in `analysisRuns`):
- Provider and model used
- Token counts (prompt + completion)
- Latency in milliseconds
- Error messages on failure

---

## 🏢 Multi-Tenancy & Security

### Organization Scoping

Every backend function enforces organization isolation:

```typescript
// packages/backend/convex/auth.ts
export async function getIdentityOrThrow(ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Nicht authentifiziert");
  const orgId = identity.org_id;
  if (!orgId) throw new Error("Keine Organisation");
  return { userId: identity.subject, orgId, email: identity.email };
}
```

All queries and mutations filter by `orgId` to prevent cross-org data access.

### Share Links

- Read-only access to specific project results
- No document file access (only processed results)
- Token-based authentication (no login required)
- Time-limited expiration
- Stateless (no server-side session)

### File Upload Security

- Client-side extraction (no raw files sent to backend)
- Size validation (sum ≤ MAX_UPLOAD_MB)
- Only text extracted and stored (not binary data)
- Convex storage IDs for file references

---

## 📊 Performance & Scalability

### Analysis Performance

**Typical timings** (50-page PDF):
- **Document extraction**: 5-10 seconds (client-side)
- **Standard analysis**: 30-60 seconds (first results)
- **Full analysis**: 3-5 minutes (complete)
- **Criteria analysis**: 1-2 minutes (per template)

**Optimization strategies:**
- Chunking large documents (8-12 pages per LLM call)
- Parallel processing where possible
- Convex live queries for real-time UI updates
- Client-side extraction to reduce server load

### Backpressure Management

To prevent API rate limiting and cost overruns:

- **Configurable concurrency**: `CONVEX_MAX_ACTIVE_RUNS_PER_ORG` (default: 1)
- **Queue system**: Runs enqueue as "wartet" when limit reached
- **Status tracking**: `wartet` → `läuft` → `fertig` / `fehler`
- **Per-org limits**: Each organization has independent quota

---

## 🎨 UI/UX Design Principles

### Consistency

- **Component library**: shadcn/ui for accessible, customizable components
- **Design system**: Tailwind CSS with consistent spacing, typography, colors
- **German localization**: All UI text in German, including Clerk elements

### Key Components

**Status Badges** (`components/status-badge.tsx`):
- Visual indicators for analysis progress
- Colors: Gray (wartet), Blue (läuft), Green (fertig), Red (fehler)

**Citation Display**:
- Every extracted fact shows page number and quote
- Click to see context (future enhancement: jump to PDF viewer)

**Responsive Layout**:
- Sidebar navigation (collapsible on mobile)
- Board and list view toggles for projects/templates
- Print-optimized styles for PDF export

**Real-time Updates**:
- Convex live queries propagate status changes instantly
- No polling or manual refresh needed

---

## 🧪 Testing

### Current Testing Strategy

- **E2E Tests**: Planned with Playwright (see `tasks.md` Phase 13)
- **Unit Tests**: Zod schema validation
- **Manual QA**: Regular testing with real tender documents

### Test Cases (Planned)

1. Upload multiple files → start standard analysis → status transitions
2. Standard view displays all sections with citations
3. Criteria analysis with template → found/not found results
4. PDF export preserves all content and citations
5. Share link loads without login, is read-only, and expires correctly

---

## 🗺️ Roadmap

See `tasks.md` for detailed phase breakdown (Phases 0-14 completed).

### Completed Features ✅

- [x] Authentication and organization management (Clerk)
- [x] Project and document management
- [x] Template system with criteria editor
- [x] Standard analysis (summary, milestones, requirements, etc.)
- [x] Criteria analysis with custom templates
- [x] PDF export and share links
- [x] Comments and basic collaboration
- [x] Search and filtering for projects/templates
- [x] View toggles (board/list) with delete functionality
- [x] Clickable project cards with hover effects

### In Progress 🚧

- [ ] **Phase 15-20**: Multi-offer comparison feature (see `MILESTONE_OFFERTEN_VERGLEICH.md`)
  - Upload Pflichtenheft → extract criteria automatically
  - Add multiple vendor offers → check against criteria
  - Comparison matrix view (criteria × offers)
  - Erfüllungsgrad (fulfillment rate) calculation

### Future Enhancements 🔮

- [ ] E2E test suite with Playwright
- [ ] Advanced filtering and sorting
- [ ] Template marketplace (public templates)
- [ ] Bulk operations (import/export)
- [ ] Advanced analytics and reporting
- [ ] Mobile app (React Native)
- [ ] Integration with procurement platforms
- [ ] Custom LLM fine-tuning for Swiss tenders

---

## 🤝 Contributing

This is a proprietary project by [Cloud Solution GmbH](https://cloud-solution.ch). Contributions are currently limited to internal team members.

For questions or support, contact: [your-email@cloud-solution.ch]

---

## 📄 License

Proprietary - All rights reserved by Cloud Solution GmbH

---

## 🙏 Acknowledgments

Built with:
- [React](https://react.dev) - UI library
- [Convex](https://convex.dev) - Backend platform
- [Clerk](https://clerk.com) - Authentication
- [shadcn/ui](https://ui.shadcn.com) - Component library
- [TanStack Router](https://tanstack.com/router) - Type-safe routing
- [Tailwind CSS](https://tailwindcss.com) - Styling
- [OpenAI](https://openai.com) / [Anthropic](https://anthropic.com) - LLM providers

---

## 📞 Support

For technical support or inquiries:

- **Website**: [cloud-solution.ch](https://cloud-solution.ch)
- **Email**: support@cloud-solution.ch
- **GitHub**: [cloudsolutiongmbh/tenderav2](https://github.com/cloudsolutiongmbh/tenderav2)

---

Made with ❤️ by [Cloud Solution GmbH](https://cloud-solution.ch)
