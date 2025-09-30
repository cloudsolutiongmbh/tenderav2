# Database Schema Documentation

**Last Updated:** 2025-09-30
**Database:** Convex (serverless document database)
**Schema Definition:** `packages/backend/convex/schema.ts`

---

## Table of Contents

1. [Entity Relationship Diagram](#entity-relationship-diagram)
2. [Tables](#tables)
3. [Indexes](#indexes)
4. [Data Types](#data-types)
5. [Relationships](#relationships)
6. [Migration Notes](#migration-notes)

---

## Entity Relationship Diagram

```
┌─────────────────┐
│  organizations  │ (Managed by Clerk, referenced by orgId)
└────────┬────────┘
         │
         │ 1:N
         ↓
┌────────────────────────────────────────────────────────────┐
│                        projects                            │
├────────────────────────────────────────────────────────────┤
│ _id: Id<"projects">                                        │
│ name: string                                               │
│ customer: string                                           │
│ tags: string[]                                             │
│ projectType?: "standard" | "offerten"                      │
│ templateId?: Id<"templates">                               │
│ latestRunId?: Id<"analysisRuns">                           │
│ orgId: string                                              │
│ createdBy: string                                          │
│ createdAt: number                                          │
└─────┬──────────────────────────────────────────────┬───────┘
      │                                              │
      │ 1:N                                          │ 1:N
      ↓                                              ↓
┌──────────────────────┐                  ┌──────────────────────┐
│     documents        │                  │   analysisRuns       │
├──────────────────────┤                  ├──────────────────────┤
│ _id                  │                  │ _id                  │
│ projectId (FK)       │                  │ projectId (FK)       │
│ filename             │                  │ type                 │
│ mimeType             │                  │ status               │
│ size                 │                  │ error?               │
│ storageId            │                  │ queuedAt             │
│ pageCount?           │                  │ startedAt?           │
│ textExtracted        │                  │ finishedAt?          │
│ role?                │                  │ dispatchedAt?        │
│ orgId                │                  │ resultId? (FK)       │
│ createdAt            │                  │ offerId? (FK)        │
│ updatedAt            │                  │ templateSnapshotId?  │
└──────┬───────────────┘                  │ provider             │
       │                                  │ model                │
       │ 1:N                              │ promptTokens?        │
       ↓                                  │ completionTokens?    │
┌──────────────────────┐                  │ latencyMs?           │
│      docPages        │                  │ orgId                │
├──────────────────────┤                  │ createdBy            │
│ _id                  │                  │ createdAt            │
│ documentId (FK)      │                  └──────┬───────────────┘
│ page: number         │                         │
│ text: string         │                         │ 1:1
│ orgId                │                         ↓
└──────────────────────┘                  ┌──────────────────────┐
                                          │  analysisResults     │
                                          ├──────────────────────┤
┌──────────────────────┐                  │ _id                  │
│     templates        │                  │ projectId (FK)       │
├──────────────────────┤                  │ runId (FK)           │
│ _id                  │◄─────────────────┤ type                 │
│ name                 │                  │ standard?            │
│ description?         │                  │ criteria?            │
│ language             │                  │ orgId                │
│ version              │                  │ createdAt            │
│ visibleOrgWide       │                  └──────────────────────┘
│ criteria[]           │
│ orgId                │
│ createdBy            │
│ updatedBy?           │
│ createdAt            │
│ updatedAt            │
└──────────────────────┘

┌──────────────────────┐
│       shares         │
├──────────────────────┤
│ _id                  │
│ projectId (FK)       │
│ token: string        │
│ expiresAt?: number   │
│ createdBy            │
│ orgId                │
│ createdAt            │
└──────────────────────┘

┌──────────────────────┐
│      comments        │
├──────────────────────┤
│ _id                  │
│ projectId (FK)       │
│ contextType          │
│ referenceId?         │
│ referenceLabel?      │
│ content              │
│ orgId                │
│ createdBy            │
│ createdAt            │
└──────────────────────┘

┌──────────────────────┐
│       offers         │ (Offerten-Vergleich)
├──────────────────────┤
│ _id                  │
│ projectId (FK)       │
│ anbieterName         │
│ documentId? (FK)     │
│ notes?               │
│ latestRunId? (FK)    │
│ latestStatus?        │
│ createdBy            │
│ orgId                │
│ createdAt            │
│ updatedAt            │
└──────┬───────────────┘
       │
       │ 1:N
       ↓
┌──────────────────────────────┐
│    offerCriteriaResults      │
├──────────────────────────────┤
│ _id                          │
│ projectId (FK)               │
│ offerId (FK)                 │
│ runId (FK)                   │
│ criterionKey                 │
│ criterionTitle               │
│ required                     │
│ weight                       │
│ status                       │
│ comment?                     │
│ citations[]                  │
│ confidence?                  │
│ provider?                    │
│ model?                       │
│ checkedAt                    │
│ orgId                        │
│ createdAt                    │
│ updatedAt                    │
└──────────────────────────────┘
```

---

## Tables

### `projects`

**Purpose:** Main project entity representing a tender analysis project.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"projects">` | Auto-generated unique identifier |
| `name` | `string` | Project name (e.g., "Stadt Zürich Infrastruktur 2025") |
| `customer` | `string` | Customer/authority name (e.g., "Stadt Zürich, Tiefbauamt") |
| `tags` | `string[]` | Internal tags for categorization |
| `projectType` | `"standard" \| "offerten"` | Project type (optional) |
| `templateId` | `Id<"templates">?` | Linked criteria template (optional) |
| `latestRunId` | `Id<"analysisRuns">?` | Most recent analysis run (optional) |
| `orgId` | `string` | Organization ID from Clerk JWT |
| `createdBy` | `string` | User ID who created the project |
| `createdAt` | `number` | Unix timestamp (milliseconds) |

**Indexes:**
- `by_orgId`: `(orgId)` - For listing projects per organization

**Business Rules:**
- All projects must belong to an organization (`orgId` required)
- Project names should be unique within an organization (not enforced by schema)
- Deleting a project cascades to documents, analysisRuns, comments, shares

---

### `documents`

**Purpose:** Uploaded document files (PDF, DOCX, TXT) belonging to a project.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"documents">` | Auto-generated unique identifier |
| `projectId` | `Id<"projects">` | Parent project |
| `filename` | `string` | Original filename |
| `mimeType` | `string` | MIME type (e.g., "application/pdf") |
| `size` | `number` | File size in bytes |
| `storageId` | `Id<"_storage">` | Convex storage reference |
| `pageCount` | `number?` | Number of extracted pages (optional) |
| `textExtracted` | `boolean` | Whether text has been extracted |
| `role` | `"pflichtenheft" \| "offer" \| "support"?` | Document role in Offerten-Vergleich (optional) |
| `orgId` | `string` | Organization ID |
| `createdAt` | `number` | Upload timestamp |
| `updatedAt` | `number` | Last update timestamp |

**Indexes:**
- `by_projectId`: `(projectId)` - For listing documents per project
- `by_projectId_role`: `(projectId, role)` - For filtering by role
- `by_orgId`: `(orgId)` - For org-scoped queries

**Business Rules:**
- Total size of all documents per project ≤ `MAX_UPLOAD_MB` (enforced client-side)
- `textExtracted = true` required before starting analysis
- Deleting a document should delete associated `docPages` and storage blob

---

### `docPages`

**Purpose:** Extracted text content per page from documents.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"docPages">` | Auto-generated unique identifier |
| `documentId` | `Id<"documents">` | Parent document |
| `page` | `number` | Page number (1-indexed) |
| `text` | `string` | Extracted text content |
| `orgId` | `string` | Organization ID |

**Indexes:**
- `by_documentId`: `(documentId)` - For fetching all pages of a document
- `by_documentId_page`: `(documentId, page)` - For fetching specific page

**Business Rules:**
- Pages are 1-indexed
- For DOCX files, pages are pseudo-pages (split by headings or length heuristic)
- Text is stored as-is (no markdown conversion)
- Used as input for LLM analysis (chunked by `CONVEX_ANALYSIS_PAGES_PER_CHUNK`)

---

### `templates`

**Purpose:** Reusable criteria templates for project evaluation.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"templates">` | Auto-generated unique identifier |
| `name` | `string` | Template name |
| `description` | `string?` | Optional description |
| `language` | `string` | Language code (e.g., "de") |
| `version` | `string` | Version string (e.g., "1.0") |
| `visibleOrgWide` | `boolean` | Visible to all org members |
| `criteria` | `Criterion[]` | Array of criteria objects (see below) |
| `orgId` | `string` | Organization ID |
| `createdBy` | `string` | User ID who created |
| `updatedBy` | `string?` | User ID who last updated |
| `createdAt` | `number` | Creation timestamp |
| `updatedAt` | `number` | Last update timestamp |

**Criterion Object:**
```typescript
{
  key: string;               // Unique key within template (e.g., "MUSS_1")
  title: string;             // Criterion title
  description?: string;      // Detailed description
  hints?: string;            // Hints for LLM evaluation
  answerType: "boolean" | "skala" | "text"; // Expected answer type
  weight: number;            // Importance weight (0-100)
  required: boolean;         // Muss (true) vs Kann (false)
  keywords?: string[];       // Optional keywords for matching
  sourcePages?: number[];    // Page references (for auto-extracted templates)
}
```

**Indexes:**
- `by_orgId`: `(orgId)` - For listing templates per org
- `by_visibility`: `(visibleOrgWide)` - For public template browsing

**Business Rules:**
- Templates are org-scoped
- `visibleOrgWide = true` makes template visible to all org members
- Criterion keys must be unique within template
- Deleting a template does NOT delete projects using it (projects retain `templateId` reference)

---

### `analysisRuns`

**Purpose:** Tracks analysis job execution status and telemetry.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"analysisRuns">` | Auto-generated unique identifier |
| `projectId` | `Id<"projects">` | Target project |
| `type` | `"standard" \| "criteria" \| "pflichtenheft_extract" \| "offer_check"` | Analysis type |
| `status` | `"wartet" \| "läuft" \| "fertig" \| "fehler"` | Execution status |
| `error` | `string?` | Error message if failed |
| `queuedAt` | `number` | Timestamp when run was queued |
| `startedAt` | `number?` | Timestamp when execution started |
| `finishedAt` | `number?` | Timestamp when execution finished |
| `dispatchedAt` | `number?` | Timestamp when run was dispatched to worker |
| `resultId` | `Id<"analysisResults">?` | Link to result record |
| `offerId` | `Id<"offers">?` | For offer_check runs |
| `templateSnapshotId` | `Id<"templates">?` | Snapshot of template used |
| `provider` | `string` | LLM provider ("OPENAI" or "ANTHROPIC") |
| `model` | `string` | Model name (e.g., "gpt-4o-mini") |
| `promptTokens` | `number?` | Input tokens consumed |
| `completionTokens` | `number?` | Output tokens generated |
| `latencyMs` | `number?` | Total execution time |
| `orgId` | `string` | Organization ID |
| `createdBy` | `string` | User ID who triggered |
| `createdAt` | `number` | Creation timestamp |

**Indexes:**
- `by_projectId`: `(projectId)` - For listing runs per project
- `by_projectId_type`: `(projectId, type)` - For fetching specific run type
- `by_orgId`: `(orgId)` - For backpressure management

**Business Rules:**
- Status transitions: `wartet → läuft → fertig/fehler`
- Backpressure: Max `CONVEX_MAX_ACTIVE_RUNS_PER_ORG` runs with status `läuft` per org
- Telemetry fields populated on completion
- `resultId` links to `analysisResults` table (1:1 relationship)

---

### `analysisResults`

**Purpose:** Stores structured LLM analysis outputs.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"analysisResults">` | Auto-generated unique identifier |
| `projectId` | `Id<"projects">` | Target project |
| `runId` | `Id<"analysisRuns">` | Analysis run that generated this |
| `type` | `"standard" \| "criteria"` | Result type |
| `standard` | `StandardResult?` | Standard analysis output (see schema below) |
| `criteria` | `CriteriaResult?` | Criteria analysis output (see schema below) |
| `orgId` | `string` | Organization ID |
| `createdAt` | `number` | Creation timestamp |

**StandardResult Schema:**
```typescript
{
  summary: string | null;         // Executive summary (200-300 words)
  milestones: Array<{
    title: string;
    date?: string | null;         // ISO date or null
    citation?: Citation | null;
  }>;
  requirements: Array<{
    title: string;
    category?: string | null;     // e.g., "Technisch", "Rechtlich"
    notes?: string | null;
    citation?: Citation | null;
  }>;
  metadata: Array<{
    label: string;                // e.g., "Auftraggeber"
    value: string;
    citation?: Citation | null;
  }>;
}
```

**CriteriaResult Schema:**
```typescript
{
  templateId?: Id<"templates">;
  summary?: string;
  items: Array<{
    criterionId: string;          // Matches criterion.key from template
    title: string;
    status: "gefunden" | "nicht_gefunden" | "teilweise";
    comment?: string;             // LLM commentary
    answer?: string;
    score?: number;               // Skala answer (1-5)
    weight?: number;
    citations: Citation[];
  }>;
}
```

**Citation Object:**
```typescript
{
  documentId?: Id<"documents">;  // Optional (for future deep linking)
  page: number;                  // 1-indexed
  quote: string;                 // Short excerpt from source
}
```

**Indexes:**
- `by_projectId`: `(projectId)` - For fetching all results per project
- `by_projectId_type`: `(projectId, type)` - For fetching specific result type
- `by_type`: `(type)` - For global result queries

**Business Rules:**
- Exactly one of `standard` or `criteria` must be populated (based on `type`)
- Results are immutable once created
- Citations are mandatory for all extracted facts

---

### `shares`

**Purpose:** Time-limited read-only share links for external stakeholders.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"shares">` | Auto-generated unique identifier |
| `projectId` | `Id<"projects">` | Shared project |
| `token` | `string` | Cryptographically secure random token (base64url) |
| `expiresAt` | `number?` | Unix timestamp when link expires (optional) |
| `createdBy` | `string` | User ID who created link |
| `orgId` | `string` | Organization ID |
| `createdAt` | `number` | Creation timestamp |

**Indexes:**
- `by_token`: `(token)` - For fast token lookup (should be unique)
- `by_projectId`: `(projectId)` - For listing shares per project

**Business Rules:**
- Token generated using `crypto.getRandomValues()` (32 bytes, base64url encoded)
- Share links grant read-only access to analysis results (no document downloads)
- Expired links return error when accessed
- No auth required for share route (`/share/:token`)

---

### `comments`

**Purpose:** Project-scoped comments for collaboration.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"comments">` | Auto-generated unique identifier |
| `projectId` | `Id<"projects">` | Parent project |
| `contextType` | `"general" \| "milestone" \| "criterion"` | Comment context |
| `referenceId` | `string?` | ID of referenced item (e.g., criterion key) |
| `referenceLabel` | `string?` | Human-readable label |
| `content` | `string` | Comment text |
| `orgId` | `string` | Organization ID |
| `createdBy` | `string` | User ID who created |
| `createdAt` | `number` | Creation timestamp |

**Indexes:**
- `by_projectId`: `(projectId)` - For listing comments per project
- `by_orgId`: `(orgId)` - For org-scoped queries

**Business Rules:**
- Comments are org-scoped (via `projectId` → project.orgId)
- No edit/delete functionality (append-only)
- `contextType` determines UI rendering

---

### `offers` (Offerten-Vergleich)

**Purpose:** Vendor offers to be compared against criteria.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"offers">` | Auto-generated unique identifier |
| `projectId` | `Id<"projects">` | Parent project |
| `anbieterName` | `string` | Vendor/supplier name |
| `documentId` | `Id<"documents">?` | Uploaded offer document (optional) |
| `notes` | `string?` | Internal notes |
| `latestRunId` | `Id<"analysisRuns">?` | Most recent offer_check run |
| `latestStatus` | `"wartet" \| "läuft" \| "fertig" \| "fehler"?` | Cached status |
| `createdBy` | `string` | User ID who created |
| `orgId` | `string` | Organization ID |
| `createdAt` | `number` | Creation timestamp |
| `updatedAt` | `number` | Last update timestamp |

**Indexes:**
- `by_projectId`: `(projectId)` - For listing offers per project
- `by_orgId`: `(orgId)` - For org-scoped queries

**Business Rules:**
- Multiple offers can exist per project
- `documentId` is optional (manual evaluation without document)
- Deleting an offer cascades to `offerCriteriaResults`

---

### `offerCriteriaResults`

**Purpose:** Stores evaluation results for each criterion × offer combination.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"offerCriteriaResults">` | Auto-generated unique identifier |
| `projectId` | `Id<"projects">` | Parent project |
| `offerId` | `Id<"offers">` | Evaluated offer |
| `runId` | `Id<"analysisRuns">` | Analysis run that generated this |
| `criterionKey` | `string` | Criterion key from template |
| `criterionTitle` | `string` | Criterion title (cached) |
| `required` | `boolean` | Muss vs Kann (cached) |
| `weight` | `number` | Criterion weight (cached) |
| `status` | `"erfuellt" \| "nicht_erfuellt" \| "teilweise" \| "unklar"` | Fulfillment status |
| `comment` | `string?` | LLM evaluation commentary |
| `citations` | `Citation[]` | Supporting evidence |
| `confidence` | `number?` | Confidence score (0-100) |
| `provider` | `string?` | LLM provider used |
| `model` | `string?` | LLM model used |
| `checkedAt` | `number` | Evaluation timestamp |
| `orgId` | `string` | Organization ID |
| `createdAt` | `number` | Creation timestamp |
| `updatedAt` | `number` | Last update timestamp |

**Indexes:**
- `by_offerId`: `(offerId)` - For fetching all results for an offer
- `by_projectId`: `(projectId)` - For project-level queries
- `by_projectId_offerId`: `(projectId, offerId)` - For efficient filtering
- `by_runId`: `(runId)` - For tracking results per run

**Business Rules:**
- One result per (offer, criterion) pair per run
- Results are immutable once created
- Cached criterion metadata for efficient queries

---

### `todos` (Legacy)

**Purpose:** Legacy table from template project. Not used in production.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `Id<"todos">` | Auto-generated unique identifier |
| `text` | `string` | Todo text |
| `completed` | `boolean` | Completion status |

**Note:** This table should be removed in future cleanup.

---

## Indexes

### Purpose and Performance

Indexes are critical for query performance in Convex. All indexes are automatically maintained.

### Index Naming Convention

- `by_<field>`: Single-field index
- `by_<field1>_<field2>`: Composite index

### Performance Guidelines

1. **Always use indexes for queries**
   - ❌ `ctx.db.query("projects").collect()` (full table scan)
   - ✅ `ctx.db.query("projects").withIndex("by_orgId", q => q.eq("orgId", orgId)).collect()`

2. **Composite indexes for filtered queries**
   - Example: Fetching runs by project and type
   - Index: `by_projectId_type`
   - Query: `.withIndex("by_projectId_type", q => q.eq("projectId", id).eq("type", "standard"))`

3. **Avoid unbounded queries**
   - ❌ `.collect()` on large tables without filters
   - ✅ `.take(100)` or filter by indexed field

---

## Data Types

### Convex Types

| Type | Description | Example |
|------|-------------|---------|
| `string` | UTF-8 string | `"Projekt ABC"` |
| `number` | 64-bit float | `1735689600000` (timestamp) |
| `boolean` | true/false | `true` |
| `null` | Null value | `null` |
| `Id<"table">` | Typed reference | `Id<"projects">` |
| `array` | Ordered list | `["tag1", "tag2"]` |
| `object` | Nested document | `{ page: 1, quote: "..." }` |

### Timestamp Convention

All timestamps are Unix timestamps in **milliseconds** (JavaScript `Date.now()`):
- `createdAt: 1735689600000`
- ISO conversion: `new Date(timestamp).toISOString()`

---

## Relationships

### Foreign Key Patterns

Convex does not enforce referential integrity. Foreign keys are maintained by application logic.

**Naming Convention:**
- Field name = `<table>Id`
- Example: `projectId: Id<"projects">`

**Cascade Delete Logic:**

```typescript
// Example: Deleting a project
export const remove = mutation({
  handler: async (ctx, { projectId }) => {
    // 1. Delete child records first
    const documents = await ctx.db.query("documents")
      .withIndex("by_projectId", q => q.eq("projectId", projectId))
      .collect();

    for (const doc of documents) {
      // Delete docPages
      const pages = await ctx.db.query("docPages")
        .withIndex("by_documentId", q => q.eq("documentId", doc._id))
        .collect();
      for (const page of pages) await ctx.db.delete(page._id);

      // Delete storage blob
      await ctx.storage.delete(doc.storageId);

      // Delete document
      await ctx.db.delete(doc._id);
    }

    // 2. Delete other child records (comments, shares, runs, results)
    // ...

    // 3. Finally delete project
    await ctx.db.delete(projectId);
  }
});
```

---

## Migration Notes

### Schema Changes

Convex supports incremental schema changes. New fields are added as optional, then backfilled.

**Example Migration:**

```typescript
// Step 1: Add optional field
defineTable({
  name: v.string(),
  newField: v.optional(v.string()),
})

// Step 2: Backfill data
export const backfillNewField = internalMutation({
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").collect();
    for (const project of projects) {
      if (!project.newField) {
        await ctx.db.patch(project._id, { newField: "default" });
      }
    }
  }
});

// Step 3: Make field required
defineTable({
  name: v.string(),
  newField: v.string(), // Now required
})
```

### Deprecated Fields

- `analysisResults.standard.openQuestions` - Deprecated, removed via migration
- `todos` table - Legacy, should be removed

---

## Query Examples

### Fetching Projects for Organization

```typescript
const projects = await ctx.db
  .query("projects")
  .withIndex("by_orgId", (q) => q.eq("orgId", identity.orgId))
  .collect();
```

### Fetching Latest Analysis Run

```typescript
const runs = await ctx.db
  .query("analysisRuns")
  .withIndex("by_projectId_type", (q) =>
    q.eq("projectId", projectId).eq("type", "standard")
  )
  .order("desc") // Newest first
  .take(1);

const latest = runs[0];
```

### Fetching Document Pages

```typescript
const pages = await ctx.db
  .query("docPages")
  .withIndex("by_documentId", (q) => q.eq("documentId", docId))
  .collect();

pages.sort((a, b) => a.page - b.page); // Ensure page order
```

### Resolving Share Token

```typescript
const share = await ctx.db
  .query("shares")
  .withIndex("by_token", (q) => q.eq("token", token))
  .first();

if (!share) throw new Error("Invalid token");
if (share.expiresAt && Date.now() > share.expiresAt) {
  throw new Error("Link expired");
}
```

---

## Security Considerations

### Org Isolation

**Every query/mutation MUST filter by `orgId`:**

```typescript
// ❌ WRONG: Cross-org access possible
const project = await ctx.db.get(projectId);

// ✅ CORRECT: Verify ownership
const project = await ctx.db.get(projectId);
if (!project || project.orgId !== identity.orgId) {
  throw new Error("Not authorized");
}
```

### Share Link Security

- Tokens generated with `crypto.getRandomValues()` (cryptographically secure)
- 32 bytes = 256 bits of entropy (brute-force infeasible)
- No session state = stateless authentication
- Time-limited expiration

### Data Sanitization

- LLM outputs validated with Zod schemas
- No raw user input stored in prompts without validation
- Citations limited to page number + short quote (no full document text)

---

**Schema maintained by:** Cloud Solution GmbH
**Next review:** After major schema changes or migrations
