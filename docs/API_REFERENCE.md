# API Reference - Convex Backend Functions

**Last Updated:** 2025-09-30
**Backend Location:** `packages/backend/convex/`

---

## Table of Contents

1. [Authentication](#authentication)
2. [Projects API](#projects-api)
3. [Documents API](#documents-api)
4. [Templates API](#templates-api)
5. [Analysis API](#analysis-api)
6. [Shares API](#shares-api)
7. [Comments API](#comments-api)
8. [Offers API (Offerten-Vergleich)](#offers-api)
9. [Error Handling](#error-handling)

---

## Authentication

All backend functions (except share resolution) require authentication via Clerk JWT.

### `getIdentityOrThrow(ctx)`

**File:** `packages/backend/convex/auth.ts`
**Type:** Helper function

Returns authenticated user identity with organization information.

**Returns:**
```typescript
{
  userId: string;    // Clerk user ID
  orgId: string;     // Organization ID from JWT
  email?: string;    // User email
}
```

**Throws:**
- `"Nicht authentifiziert"` if no identity
- `"Keine Organisation"` if no orgId in JWT

**Usage:**
```typescript
export const myFunction = mutation({
  handler: async (ctx, args) => {
    const identity = await getIdentityOrThrow(ctx);
    // identity.orgId is guaranteed to exist
  }
});
```

---

## Projects API

### `create`

**File:** `packages/backend/convex/projects.ts`
**Type:** Mutation

Creates a new project.

**Arguments:**
```typescript
{
  name: string;              // Project name
  customer: string;          // Customer/authority name
  tags: string[];            // Internal tags
  projectType?: "standard" | "offerten";
  templateId?: Id<"templates">;
}
```

**Returns:**
```typescript
{
  projectId: Id<"projects">;
}
```

**Example:**
```typescript
const { projectId } = await ctx.runMutation(api.projects.create, {
  name: "Stadt Zürich Infrastruktur 2025",
  customer: "Stadt Zürich, Tiefbauamt",
  tags: ["zürich", "infrastruktur", "2025"],
  templateId: templateId,
});
```

---

### `list`

**File:** `packages/backend/convex/projects.ts`
**Type:** Query

Lists projects for the current organization with optional filtering.

**Arguments:**
```typescript
{
  filter?: string;  // Search filter (name, customer, tags)
}
```

**Returns:**
```typescript
Array<{
  _id: Id<"projects">;
  name: string;
  customer: string;
  tags: string[];
  projectType?: "standard" | "offerten";
  templateId?: Id<"templates">;
  latestRunId?: Id<"analysisRuns">;
  createdAt: number;
  // ... latest run status if available
}>
```

**Example:**
```typescript
const projects = useQuery(api.projects.list, { filter: "zürich" });
```

---

### `get`

**File:** `packages/backend/convex/projects.ts`
**Type:** Query

Fetches a single project by ID.

**Arguments:**
```typescript
{
  projectId: Id<"projects">;
}
```

**Returns:** Project object or null if not found/not authorized.

---

### `update`

**File:** `packages/backend/convex/projects.ts`
**Type:** Mutation

Updates project metadata.

**Arguments:**
```typescript
{
  projectId: Id<"projects">;
  name?: string;
  customer?: string;
  tags?: string[];
  templateId?: Id<"templates">;
}
```

**Returns:** `void`

---

### `remove`

**File:** `packages/backend/convex/projects.ts`
**Type:** Mutation

Deletes a project and all related data (cascade delete).

**Arguments:**
```typescript
{
  projectId: Id<"projects">;
}
```

**Cascades to:**
- documents (+ storage blobs)
- docPages
- analysisRuns
- analysisResults
- comments
- shares
- offers (if Offerten project)
- offerCriteriaResults

**Returns:** `void`

**Warning:** This operation is **irreversible**. Consider soft-delete for production.

---

### `startStandardAnalysis`

**File:** `packages/backend/convex/projects.ts`
**Type:** Mutation

Starts a standard analysis run.

**Arguments:**
```typescript
{
  projectId: Id<"projects">;
}
```

**Returns:**
```typescript
{
  runId: Id<"analysisRuns">;
  status: "wartet" | "läuft";  // Depends on queue status
}
```

**Behavior:**
1. Checks if documents have `textExtracted = true`
2. Creates `analysisRuns` record with `type: "standard"`
3. If queue full (per `CONVEX_MAX_ACTIVE_RUNS_PER_ORG`), status = `"wartet"`
4. Otherwise, dispatches action immediately and status = `"läuft"`

---

### `startCriteriaAnalysis`

**File:** `packages/backend/convex/projects.ts`
**Type:** Mutation

Starts a criteria analysis run.

**Arguments:**
```typescript
{
  projectId: Id<"projects">;
}
```

**Requirements:**
- Project must have `templateId` set
- Documents must have `textExtracted = true`

**Returns:** Same as `startStandardAnalysis`

---

## Documents API

### `createUploadUrl`

**File:** `packages/backend/convex/documents.ts`
**Type:** Mutation

Generates a signed upload URL for Convex storage.

**Arguments:** None

**Returns:**
```typescript
{
  uploadUrl: string;  // POST file to this URL
}
```

**Example:**
```typescript
const { uploadUrl } = await ctx.runMutation(api.documents.createUploadUrl, {});
const result = await fetch(uploadUrl, {
  method: "POST",
  headers: { "Content-Type": file.type },
  body: file,
});
const { storageId } = await result.json();
```

---

### `attach`

**File:** `packages/backend/convex/documents.ts`
**Type:** Mutation

Attaches an uploaded document to a project.

**Arguments:**
```typescript
{
  projectId: Id<"projects">;
  filename: string;
  mimeType: string;
  size: number;
  storageId: Id<"_storage">;
  role?: "pflichtenheft" | "offer" | "support";
}
```

**Returns:**
```typescript
{
  documentId: Id<"documents">;
}
```

**Validation:**
- Verifies project ownership
- Checks total project document size ≤ `MAX_UPLOAD_MB` (server-side check)

---

### `listByProject`

**File:** `packages/backend/convex/documents.ts`
**Type:** Query

Lists documents for a project.

**Arguments:**
```typescript
{
  projectId: Id<"projects">;
}
```

**Returns:**
```typescript
Array<{
  _id: Id<"documents">;
  filename: string;
  mimeType: string;
  size: number;
  pageCount?: number;
  textExtracted: boolean;
  role?: "pflichtenheft" | "offer" | "support";
  createdAt: number;
}>
```

---

### `remove`

**File:** `packages/backend/convex/documents.ts`
**Type:** Mutation

Deletes a document, its pages, and storage blob.

**Arguments:**
```typescript
{
  documentId: Id<"documents">;
}
```

**Cascades to:**
- docPages (all pages for this document)
- Storage blob (via `ctx.storage.delete`)
- Offer comparison data linked to the document (offers, offerCriterionJobs, offerCriteriaResults)

**Returns:**
```json
{
  "success": true,
  "removedPages": number,
  "removedOffers": number
}
```

---

## Templates API

### `list`

**File:** `packages/backend/convex/templates.ts`
**Type:** Query

Lists templates visible to the current organization.

**Arguments:** None

**Returns:**
```typescript
Array<{
  _id: Id<"templates">;
  name: string;
  description?: string;
  language: string;
  version: string;
  visibleOrgWide: boolean;
  criteriaCount: number;  // Derived field
  createdAt: number;
}>
```

**Includes:**
- Templates owned by current org (`orgId` match)
- Templates with `visibleOrgWide = true`

---

### `get`

**File:** `packages/backend/convex/templates.ts`
**Type:** Query

Fetches a single template with full criteria.

**Arguments:**
```typescript
{
  templateId: Id<"templates">;
}
```

**Returns:** Template object with `criteria[]` array.

---

### `upsert`

**File:** `packages/backend/convex/templates.ts`
**Type:** Mutation

Creates or updates a template.

**Arguments:**
```typescript
{
  templateId?: Id<"templates">;  // Omit for create
  name: string;
  description?: string;
  language: string;
  version: string;
  visibleOrgWide: boolean;
  criteria: Array<{
    key: string;
    title: string;
    description?: string;
    hints?: string;
    answerType: "boolean" | "skala" | "text";
    weight: number;        // 0-100
    required: boolean;     // Muss vs Kann
    keywords?: string[];
  }>;
}
```

**Returns:**
```typescript
{
  templateId: Id<"templates">;
}
```

**Validation:**
- Criterion keys must be unique within template
- Weights between 0-100

---

### `remove`

**File:** `packages/backend/convex/templates.ts`
**Type:** Mutation

Deletes a template.

**Arguments:**
```typescript
{
  templateId: Id<"templates">;
}
```

**Note:** Projects using this template retain the `templateId` reference (no cascade).

---

## Analysis API

### `getLatest`

**File:** `packages/backend/convex/analysis.ts`
**Type:** Query

Fetches the latest analysis run and result for a project.

**Arguments:**
```typescript
{
  projectId: Id<"projects">;
  type: "standard" | "criteria";
}
```

**Returns:**
```typescript
{
  run: {
    _id: Id<"analysisRuns">;
    status: "wartet" | "läuft" | "fertig" | "fehler";
    error?: string;
    queuedAt: number;
    startedAt?: number;
    finishedAt?: number;
    promptTokens?: number;
    completionTokens?: number;
    latencyMs?: number;
    provider: string;
    model: string;
  } | null;
  result: StandardResult | CriteriaResult | null;
}
```

**Usage:**
```typescript
const { run, result } = useQuery(api.analysis.getLatest, {
  projectId,
  type: "standard",
});

if (run?.status === "läuft") {
  // Show loading spinner
} else if (result) {
  // Render results
}
```

---

### `runStandard` (Action)

**File:** `packages/backend/convex/analysis.ts`
**Type:** Internal Action (called by queue system)

Executes standard analysis for a project.

**Process:**
1. Fetch all `docPages` for project documents
2. Chunk pages (default 10 per chunk)
3. For each chunk:
   - Build prompt with anti-hallucination rules
   - Call LLM via `llm.callLlm()`
   - Parse and validate JSON response (Zod)
4. Merge chunk results (deduplicate by key)
5. Store in `analysisResults`
6. Update run status to `"fertig"` or `"fehler"`

**Telemetry:**
- Total `promptTokens` and `completionTokens`
- Total `latencyMs`
- `provider` and `model` used

---

### `runCriteria` (Action)

**File:** `packages/backend/convex/analysis.ts`
**Type:** Internal Action

Executes criteria analysis for a project.

**Process:**
1. Fetch template criteria
2. Build document context from all pages
3. For each criterion:
   - Build prompt with criterion details
   - Call LLM
   - Validate response (Zod)
4. Store all criterion results in `analysisResults`
5. Update run status

**Output:**
```typescript
{
  criterionId: string;
  title: string;
  status: "gefunden" | "nicht_gefunden" | "teilweise";
  comment?: string;
  answer?: string;
  score?: number;
  citations: Citation[];
}
```

---

### `extractPflichtenheftCriteria` (Action)

**File:** `packages/backend/convex/analysis.ts`
**Type:** Action

Extracts criteria from Pflichtenheft document and creates a template.

**Arguments:**
```typescript
{
  projectId: Id<"projects">;
}
```

**Returns:**
```typescript
{
  status: "fertig";
  templateId: Id<"templates">;
  criteriaCount: number;
}
```

**Process:**
1. Fetch document pages
2. Call LLM with extraction prompt
3. Parse `mussCriteria[]` and `kannCriteria[]`
4. Create template with extracted criteria
5. Link template to project

---

### `checkOfferAgainstCriteria` (Action)

**File:** `packages/backend/convex/analysis.ts`
**Type:** Action

Checks a vendor offer against project criteria.

**Arguments:**
```typescript
{
  projectId: Id<"projects">;
  offerId: Id<"offers">;
}
```

**Returns:**
```typescript
{
  queued: true;
  runId: Id<"analysisRuns">;
}
```

**Process:**
1. Validate project, template, offer document access.
2. Reuse active `offer_check` run if one exists; otherwise create a new run with status `läuft`.
3. Create (idempotent) per-criterion jobs in `offerCriterionJobs`.
4. Schedule the background queue (`analysis.kickQueue`) which dispatches worker actions (`runOfferCriterionWorker`) up to `CONVEX_MAX_PARALLEL_OFFER_JOBS`.
5. Workers evaluate criteria in parallel, upserting results into `offerCriteriaResults` and updating run telemetry.
6. Run finalizes asynchronously:
   - `status="fertig"` once all jobs succeed.
   - `status="fehler"` if any jobs fail permanently (after retries).

Use `analysis.getOfferCheckProgress` (see below) to poll progress on the frontend.

---

### `getOfferCheckProgress` (Query)

**File:** `packages/backend/convex/analysis.ts`  
**Type:** Query

Fetches the latest offer_check run state for an offer.

**Arguments:**
```typescript
{
  offerId: Id<"offers">;
}
```

**Returns:**
```typescript
{
  run: {
    _id: Id<"analysisRuns">;
    status: "wartet" | "läuft" | "fertig" | "fehler";
    processedCount: number;
    failedCount: number;
    totalCount: number;
    startedAt: number | null;
    finishedAt: number | null;
  } | null;
}
```

Use this query to render progress bars or disable controls while an offer_check run is still in flight.

---

## Shares API

### `create`

**File:** `packages/backend/convex/shares.ts`
**Type:** Mutation

Creates a time-limited share link.

**Arguments:**
```typescript
{
  projectId: Id<"projects">;
  ttlDays?: number;  // Default: no expiration
}
```

**Returns:**
```typescript
{
  token: string;        // base64url encoded, 32 bytes
  expiresAt?: number;   // Unix timestamp
}
```

**Token Generation:**
- Uses `crypto.getRandomValues()` for cryptographic security
- 32 bytes = 256 bits of entropy
- Base64url encoded for URL safety

**Example:**
```typescript
const { token, expiresAt } = await ctx.runMutation(api.shares.create, {
  projectId,
  ttlDays: 7,
});

const shareUrl = `${window.location.origin}/share/${token}`;
```

---

### `resolve`

**File:** `packages/backend/convex/shares.ts`
**Type:** Query (no auth required)

Resolves a share token and returns read-only project data.

**Arguments:**
```typescript
{
  token: string;
}
```

**Returns:**
```typescript
{
  project: {
    name: string;
    customer: string;
    tags: string[];
  };
  standardResult?: StandardResult;
  criteriaResult?: CriteriaResult;
  templateName?: string;
}
```

**Throws:**
- `"Ungültiger Link"` if token not found
- `"Link abgelaufen"` if expired

**Security:**
- No raw document files included
- No edit permissions
- Stateless (no session)

---

## Comments API

### `add`

**File:** `packages/backend/convex/comments.ts`
**Type:** Mutation

Adds a comment to a project.

**Arguments:**
```typescript
{
  projectId: Id<"projects">;
  contextType: "general" | "milestone" | "criterion";
  referenceId?: string;      // E.g., criterion key
  referenceLabel?: string;   // E.g., "Kriterium: Technische Anforderung"
  content: string;
}
```

**Returns:**
```typescript
{
  commentId: Id<"comments">;
}
```

---

### `list`

**File:** `packages/backend/convex/comments.ts`
**Type:** Query

Lists comments for a project.

**Arguments:**
```typescript
{
  projectId: Id<"projects">;
  contextType?: "general" | "milestone" | "criterion";
  referenceId?: string;
}
```

**Returns:**
```typescript
Array<{
  _id: Id<"comments">;
  contextType: string;
  referenceId?: string;
  referenceLabel?: string;
  content: string;
  createdBy: string;
  createdAt: number;
}>
```

---

## Offers API

### `create`

**File:** `packages/backend/convex/offers.ts`
**Type:** Mutation

Creates a new vendor offer.

**Arguments:**
```typescript
{
  projectId: Id<"projects">;
  anbieterName: string;
  notes?: string;
}
```

**Returns:**
```typescript
{
  offerId: Id<"offers">;
}
```

---

### `attachDocument`

**File:** `packages/backend/convex/offers.ts`
**Type:** Mutation

Attaches a document to an offer.

**Arguments:**
```typescript
{
  offerId: Id<"offers">;
  documentId: Id<"documents">;
}
```

**Validation:**
- Document must belong to same project as offer

---

### `listByProject`

**File:** `packages/backend/convex/offers.ts`
**Type:** Query

Lists offers for a project.

**Arguments:**
```typescript
{
  projectId: Id<"projects">;
}
```

**Returns:**
```typescript
Array<{
  _id: Id<"offers">;
  anbieterName: string;
  documentId?: Id<"documents">;
  notes?: string;
  latestStatus?: "wartet" | "läuft" | "fertig" | "fehler";
  createdAt: number;
}>
```

---

### `getCriteriaResults`

**File:** `packages/backend/convex/offerCriteria.ts`
**Type:** Query

Fetches evaluation results for an offer.

**Arguments:**
```typescript
{
  offerId: Id<"offers">;
}
```

**Returns:**
```typescript
Array<{
  criterionKey: string;
  criterionTitle: string;
  required: boolean;
  weight: number;
  status: "erfuellt" | "nicht_erfuellt" | "teilweise" | "unklar";
  comment?: string;
  citations: Citation[];
  confidence?: number;
}>
```

---

## Error Handling

### Standard Error Patterns

**Authentication Errors:**
```typescript
throw new Error("Nicht authentifiziert");
throw new Error("Keine Organisation");
```

**Authorization Errors:**
```typescript
throw new ConvexError("Projekt nicht gefunden.");  // Or not authorized
```

**Validation Errors:**
```typescript
throw new ConvexError("Keine Dokumentseiten zum Analysieren gefunden.");
throw new ConvexError("Für die Kriterien-Analyse muss ein Template gewählt sein.");
```

**LLM Errors:**
```typescript
throw new Error("JSON parse failed. Raw text: ...");
```

### Client-side Error Handling

```typescript
try {
  await ctx.runMutation(api.projects.startStandardAnalysis, { projectId });
} catch (error) {
  if (error instanceof ConvexError) {
    toast.error(error.message);  // User-facing message
  } else {
    console.error("Unexpected error:", error);
    toast.error("Ein unerwarteter Fehler ist aufgetreten.");
  }
}
```

---

## Rate Limiting and Quotas

### Current Limits

| Resource | Limit | Enforcement |
|----------|-------|-------------|
| Active analysis runs per org | 1 (configurable) | Backend queue system |
| Document size per project | 400 MB | Client + server validation |
| LLM requests | Provider-dependent | OpenAI/Anthropic rate limits |
| Convex DB operations | Plan-dependent | Convex platform limits |

### Backpressure Management

Analysis runs queue when limit reached:
- Status: `"wartet"`
- Automatically processed when slot available
- Queue processed in FIFO order

---

## Telemetry and Monitoring

### Analysis Run Telemetry

Every analysis records:
- `provider`: "OPENAI" or "ANTHROPIC"
- `model`: e.g., "gpt-4o-mini"
- `promptTokens`: Input tokens
- `completionTokens`: Output tokens
- `latencyMs`: Execution time

### Cost Calculation

```typescript
// OpenAI pricing example
const inputCost = (promptTokens / 1_000_000) * 0.15;  // $0.15 per 1M input tokens
const outputCost = (completionTokens / 1_000_000) * 0.60;  // $0.60 per 1M output tokens
const totalCost = inputCost + outputCost;
```

---

## Development Patterns

### Live Query Pattern

```typescript
// Component subscribes to live data
const project = useQuery(api.projects.get, { projectId });
const { run, result } = useQuery(api.analysis.getLatest, {
  projectId,
  type: "standard",
});

// UI automatically updates when data changes
if (run?.status === "läuft") {
  return <Spinner />;
}
```

### Mutation Pattern

```typescript
const startAnalysis = useMutation(api.projects.startStandardAnalysis);

const handleClick = async () => {
  try {
    setLoading(true);
    await startAnalysis({ projectId });
    toast.success("Analyse gestartet");
  } catch (error) {
    toast.error(error.message);
  } finally {
    setLoading(false);
  }
};
```

---

**API Reference maintained by:** Cloud Solution GmbH
**Next review:** After API changes or new endpoints added
