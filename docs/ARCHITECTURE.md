# Architecture Documentation - Tendera

**Document Version:** 1.0
**Last Updated:** 2025-09-30
**Status:** Production

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Principles](#architecture-principles)
3. [System Components](#system-components)
4. [Data Flow](#data-flow)
5. [Technology Stack](#technology-stack)
6. [Deployment Architecture](#deployment-architecture)

---

## System Overview

Tendera is an AI-powered tender analysis platform for Swiss public procurement. It automates the extraction and analysis of tender documents (Pflichtenheft, Ausschreibungen) using large language models.

### Core Capabilities

1. **Document Processing Pipeline**
   - Client-side text extraction from PDF, DOCX, TXT
   - Page-based storage for efficient LLM processing
   - Multi-document project support

2. **AI Analysis Engine**
   - Standard Analysis: Automatic extraction of requirements, milestones, eligibility criteria
   - Criteria Analysis: Template-based evaluation with evidence citations
   - Offer Comparison: Multi-vendor offer evaluation (in development)

3. **Multi-tenant SaaS**
   - Organization-based isolation (via Clerk)
   - Real-time collaborative features
   - Secure share links for external stakeholders

---

## Architecture Principles

### 1. **Security First**
- All backend functions enforce `orgId` isolation
- No raw document files in analysis results (only extracted text)
- Time-limited share tokens for external access
- Client-side extraction reduces server attack surface

### 2. **Real-time Reactivity**
- Convex Live Queries for instant UI updates
- Status tracking: `wartet → läuft → fertig/fehler`
- No polling, no manual refresh

### 3. **Cost Optimization**
- Backpressure management: configurable concurrent LLM calls per org
- Chunking strategy: 8-12 pages per LLM request
- Provider switching (OpenAI ↔ Anthropic) via ENV
- Telemetry tracking (tokens, latency, costs)

### 4. **Developer Experience**
- Monorepo with Turborepo
- Type-safe routing (TanStack Router)
- Zod schema validation for LLM outputs
- Strict TypeScript configuration

---

## System Components

### Frontend (Web App)

**Location:** `apps/web/`
**Framework:** React 18 + Vite + TanStack Router

```
apps/web/src/
├── routes/                      # File-based routing
│   ├── __root.tsx              # Root layout with sidebar
│   ├── projekte.tsx            # Projects list
│   ├── projekte.$id.*.tsx     # Project detail routes
│   ├── templates.tsx           # Template management
│   └── share.$token.tsx        # Public share view
├── components/
│   ├── analysis-cards/         # Summary, milestones, requirements display
│   ├── criteria-panel/         # Criteria evaluation UI
│   ├── ui/                     # shadcn/ui component library
│   └── upload-dropzone.tsx     # Multi-file upload
├── lib/
│   └── extract-text.ts         # Client-side PDF/DOCX extraction
└── hooks/
    └── useOrgAuth.ts           # Organization auth helpers
```

**Key Responsibilities:**
- Document upload and client-side text extraction
- Real-time status monitoring via Convex subscriptions
- PDF export (browser print-to-PDF)
- Share link generation and display

---

### Backend (Convex)

**Location:** `packages/backend/convex/`
**Platform:** Convex (serverless backend-as-a-service)

```
convex/
├── schema.ts                   # Database schema definition
├── auth.ts                     # Auth helpers (getIdentityOrThrow)
├── projects.ts                 # Project CRUD + analysis triggers
├── documents.ts                # File upload via Convex storage
├── docPages.ts                 # Extracted text storage
├── templates.ts                # Criteria template management
├── analysis.ts                 # LLM analysis orchestration
├── llm.ts                      # Provider abstraction (OpenAI/Anthropic)
├── comments.ts                 # Project comments
├── shares.ts                   # Share link generation
└── healthCheck.ts              # Health monitoring
```

**Key Responsibilities:**
- Multi-tenant data isolation
- Analysis job queuing and execution
- LLM API orchestration
- Result validation and storage

---

## Data Flow

### 1. Document Upload Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Client (Browser)                                                │
├─────────────────────────────────────────────────────────────────┤
│ 1. User drops PDF/DOCX file                                     │
│ 2. Client-side extraction:                                      │
│    • PDF: pdfjs-dist extracts text per page                     │
│    • DOCX: mammoth converts to text, splits by headings         │
│    • TXT: single page                                           │
│ 3. Upload file blob → Convex Storage                            │
│ 4. Save extracted pages → docPages table                        │
│ 5. Mark document.textExtracted = true                           │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Convex Backend                                                  │
├─────────────────────────────────────────────────────────────────┤
│ • documents.attach({projectId, filename, storageId, ...})       │
│ • docPages.bulkInsert([{documentId, page, text}, ...])         │
│ • Live Query updates UI instantly                               │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Analysis Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ User clicks "Standard-Analyse starten"                          │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ projects.startStandardAnalysis({projectId})                     │
├─────────────────────────────────────────────────────────────────┤
│ 1. Create analysisRuns record:                                  │
│    • status: "wartet" (if queue full) or "läuft"               │
│    • type: "standard"                                           │
│ 2. Check backpressure limit (max active runs per org)           │
│ 3. Schedule analysis.runStandard action if slot available       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ analysis.runStandard (Convex Action)                            │
├─────────────────────────────────────────────────────────────────┤
│ 1. Fetch docPages for project                                   │
│ 2. Chunk pages (10 pages per chunk by default)                  │
│ 3. For each chunk:                                              │
│    a. Build strict prompt with anti-hallucination rules         │
│    b. Call LLM (OpenAI or Anthropic via llm.ts)                │
│    c. Parse & validate JSON response with Zod                   │
│    d. Accumulate telemetry (tokens, latency)                    │
│ 4. Merge chunk results (deduplicate by key)                     │
│ 5. Store in analysisResults table                               │
│ 6. Update analysisRuns:                                         │
│    • status: "fertig" or "fehler"                               │
│    • telemetry: tokens, latency, provider, model                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Live Query Update                                               │
├─────────────────────────────────────────────────────────────────┤
│ • analysis.getLatest({projectId, type: "standard"})            │
│ • UI automatically re-renders with new status and results       │
└─────────────────────────────────────────────────────────────────┘
```

### 3. Criteria Analysis Flow

Similar to Standard Analysis, but:
- Uses project's assigned `templateId`
- Processes each criterion individually
- Outputs status: `gefunden | nicht_gefunden | teilweise`
- Includes citations for each evaluation

### 4. Share Link Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ User clicks "Link teilen" → selects TTL (7/14/30 days)          │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ shares.create({projectId, ttlDays})                             │
├─────────────────────────────────────────────────────────────────┤
│ 1. Generate cryptographically secure token (base64url, 32 bytes)│
│ 2. Calculate expiresAt = now + ttlDays * 86400000              │
│ 3. Insert shares record with unique token index                 │
│ 4. Return {token, expiresAt} to client                         │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Client constructs URL: /share/{token}                           │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Public Route: /share/:token (no auth required)                  │
├─────────────────────────────────────────────────────────────────┤
│ 1. Call shares.resolve({token})                                 │
│ 2. Check expiration, return sanitized data:                     │
│    • Project metadata (name, customer)                          │
│    • Latest standard analysis result                            │
│    • Latest criteria analysis result                            │
│    • NO raw documents, NO edit permissions                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Framework | React 18 | UI library |
| Build Tool | Vite | Fast dev server and optimized builds |
| Routing | TanStack Router | Type-safe file-based routing |
| Styling | Tailwind CSS | Utility-first CSS framework |
| UI Components | shadcn/ui | Accessible, customizable components |
| Auth | Clerk | Authentication and organization management |
| Backend Client | Convex React | Live queries and mutations |
| Validation | Zod | Runtime type validation |
| Notifications | Sonner | Toast notifications |
| PDF Extraction | pdfjs-dist | Client-side PDF text extraction |
| DOCX Extraction | mammoth | DOCX to text conversion |

### Backend

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Platform | Convex | Serverless backend with live queries |
| Database | Convex DB | Real-time document database |
| Storage | Convex Storage | File blob storage |
| LLM Provider | OpenAI / Anthropic | Analysis AI |
| Validation | Zod | Schema validation for LLM outputs |
| Auth | Clerk (JWT) | Token verification |

### Development

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Monorepo | Turborepo | Build orchestration and caching |
| Package Manager | npm | Dependency management |
| Language | TypeScript | Type safety |
| Testing | Playwright + Vitest | E2E and unit tests |

---

## Deployment Architecture

### Production Setup

```
┌─────────────────────────────────────────────────────────────────┐
│ User Browser                                                    │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Vercel (Frontend Hosting)                                       │
├─────────────────────────────────────────────────────────────────┤
│ • Static React SPA                                              │
│ • Edge caching                                                  │
│ • Auto-scaling                                                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Clerk (Authentication)                                          │
├─────────────────────────────────────────────────────────────────┤
│ • JWT token issuance                                            │
│ • Organization management                                       │
│ • User sessions                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Convex Cloud (Backend)                                          │
├─────────────────────────────────────────────────────────────────┤
│ • Real-time database                                            │
│ • File storage                                                  │
│ • Serverless functions (queries, mutations, actions)            │
│ • WebSocket connections for live queries                        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ OpenAI / Anthropic APIs                                         │
├─────────────────────────────────────────────────────────────────┤
│ • LLM inference                                                 │
│ • Switchable via LLM_PROVIDER env var                           │
└─────────────────────────────────────────────────────────────────┘
```

### Environment Variables

**Frontend (`apps/web/.env`):**
```env
VITE_CONVEX_URL=https://your-deployment.convex.cloud
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_MAX_UPLOAD_MB=200
```

**Backend (`packages/backend/.env.local`):**
```env
# Convex (auto-generated)
CONVEX_DEPLOYMENT=prod:your-deployment
CONVEX_URL=https://your-deployment.convex.cloud

# Clerk
CLERK_JWT_ISSUER_DOMAIN=your-domain.clerk.accounts.dev

# LLM Provider
LLM_PROVIDER=OPENAI              # or ANTHROPIC
LLM_MODEL=gpt-4o-mini            # or claude-3-5-sonnet-20241022
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Analysis Configuration
CONVEX_MAX_ACTIVE_RUNS_PER_ORG=1
CONVEX_ANALYSIS_PAGES_PER_CHUNK=10
MAX_UPLOAD_MB=200
```

### Scaling Characteristics

| Metric | Current | Notes |
|--------|---------|-------|
| Concurrent Users | ~100 per org | Limited by Convex plan |
| Analysis Queue | 1 active per org | Configurable via `CONVEX_MAX_ACTIVE_RUNS_PER_ORG` |
| Document Size | 200 MB total per project | Client-side extraction limits browser memory |
| LLM Requests | Rate limited by provider | OpenAI: 10K TPM, Anthropic: varies by plan |
| Database Size | Unlimited | Convex scales automatically |
| Storage | Pay-per-GB | Convex pricing |

---

## Security Model

### Multi-Tenancy Isolation

Every backend function enforces organization isolation:

```typescript
// packages/backend/convex/auth.ts
export async function getIdentityOrThrow(ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Nicht authentifiziert");

  const orgId = identity.org_id; // From Clerk JWT
  if (!orgId) throw new Error("Keine Organisation");

  return { userId: identity.subject, orgId, email: identity.email };
}
```

All queries/mutations filter by `orgId`:
```typescript
const projects = await ctx.db
  .query("projects")
  .withIndex("by_orgId", (q) => q.eq("orgId", identity.orgId))
  .collect();
```

### Data Access Controls

| Resource | Access Control | Implementation |
|----------|---------------|----------------|
| Projects | Org-scoped | `orgId` filter on all queries |
| Documents | Org-scoped via `projectId` | Validated through project ownership |
| Templates | Org-scoped + `visibleOrgWide` flag | `by_orgId` + `by_visibility` indexes |
| Share Links | Token-based, read-only | No auth required, time-limited, no document file access |
| Comments | Org-scoped via `projectId` | Validated through project ownership |

### Attack Surface Mitigation

1. **Client-side Extraction:** No raw files sent to backend for processing
2. **Citation-only Storage:** Analysis results contain only page numbers and quotes, not full documents
3. **No File Download in Shares:** Share links grant access to analysis results only
4. **Stateless Shares:** No server-side session management

---

## Monitoring and Observability

### Telemetry Captured

Every analysis run records:
- `provider`: "OPENAI" or "ANTHROPIC"
- `model`: e.g., "gpt-4o-mini"
- `promptTokens`: Input tokens consumed
- `completionTokens`: Output tokens generated
- `latencyMs`: Total execution time
- `status`: "wartet" | "läuft" | "fertig" | "fehler"
- `error`: Error message if failed

### Health Check

Endpoint: `healthCheck.get()`
Returns: `{ status: "OK", timestamp: number }`

### Logging Strategy

- Convex Console: Real-time function logs
- Browser Console: Client-side errors
- Telemetry table: Analysis run statistics

---

## Performance Optimization

### Chunking Strategy

Large documents are split into chunks to:
1. Reduce LLM context window usage (cost)
2. Avoid rate limits
3. Enable progressive result display

Default: 10 pages per chunk (`CONVEX_ANALYSIS_PAGES_PER_CHUNK`)

### Backpressure Management

Prevents API rate limiting and cost overruns:
- Configurable concurrency: `CONVEX_MAX_ACTIVE_RUNS_PER_ORG` (default: 1)
- Queue system: Runs enqueue as "wartet" when limit reached
- Status tracking: `wartet → läuft → fertig/fehler`

### Caching Strategy

- Convex Live Queries: Automatic caching and invalidation
- No manual cache management needed
- Results are immutable once stored

---

## Future Architecture Considerations

### Planned Enhancements

1. **Offer Comparison Module**
   - New tables: `offers`, `offerCriteriaResults`
   - Comparison matrix view
   - Erfüllungsgrad (fulfillment rate) calculation

2. **Advanced Analytics**
   - Aggregated telemetry dashboard
   - Cost tracking per project/organization
   - Analysis quality metrics

3. **Mobile Support**
   - React Native app
   - Offline-first architecture
   - Push notifications for completed analyses

### Scalability Roadmap

| Bottleneck | Solution |
|-----------|----------|
| Client-side extraction limits | Migrate to server-side with worker processes |
| Serial LLM processing | Parallel processing with batching |
| Single LLM provider | Multi-provider fallback and load balancing |
| Manual template creation | Auto-generate templates from historical data |

---

**Document maintained by:** Cloud Solution GmbH
**Next review:** After major architectural changes
