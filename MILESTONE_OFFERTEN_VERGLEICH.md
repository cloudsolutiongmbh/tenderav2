# Milestone: Offerten-Vergleich (Multi-Offer Comparison)

## Overview

**Feature Name:** Offerten-Vergleich (Tender Offer Comparison)

**Problem Statement:** When a Pflichtenheft (tender specification) is sent to multiple companies (Unternehmer/Anbieter), they respond with offers. Users need a systematic way to:
1. Upload the Pflichtenheft document once
2. Extract all Muss- and Kann-Kriterien automatically via LLM
3. Upload multiple offers from different providers
4. Automatically check each criterion against each offer (erfüllt/nicht erfüllt)
5. Compare fulfillment rate (Erfüllungsgrad) per offer and across all offers

**Design Principles:**
- Reuse existing patterns (projects, documents, templates, analysis)
- Keep UI simple and consistent with current design
- No over-engineering: build on proven patterns
- Easy to use and understand

---

## Architecture Analysis & Reuse Strategy

### What We Can Reuse
1. **Projects** - Each comparison becomes a project (type: "offerten")
2. **Documents** - For Pflichtenheft and each offer document
3. **Templates** - Store extracted criteria as template
4. **Document Upload** - Existing upload flow, extraction pipeline
5. **LLM Infrastructure** - `analysis.ts`, `llm.ts` patterns
6. **Auth & Org Guards** - Same multi-tenancy patterns
7. **UI Components** - Cards, badges, tables, sidebar navigation

### What's New
1. New project type/mode: "offerten" (vs. current "standard")
2. Pflichtenheft criteria extraction (new analysis type)
3. Multi-offer management within one project
4. Criterion-by-criterion fulfillment checking per offer
5. Comparison view (table/matrix)
6. Aggregated statistics per offer and per criterion

---

## Data Model Extensions

### Schema Changes (`packages/backend/convex/schema.ts`)

```typescript
// EXTEND projects table
projects: {
  // existing fields...
  projectType: v.union(
    v.literal("standard"),
    v.literal("offerten"),
  ),
  // reuse existing templateId to store generated criteria template
}

// EXTEND documents table to tag roles
documents: defineTable({
  // existing fields...
  role: v.optional(v.union(
    v.literal("pflichtenheft"),
    v.literal("offer"),
    v.literal("support"),
  )),
})
.index("by_projectId_role", ["projectId", "role"])

// NEW table: offers
offers: defineTable({
  projectId: v.id("projects"),
  anbieterName: v.string(),
  documentId: v.optional(v.id("documents")),
  notes: v.optional(v.string()),
  latestRunId: v.optional(v.id("analysisRuns")),
  latestStatus: v.optional(
    v.union(
      v.literal("wartet"),
      v.literal("läuft"),
      v.literal("fertig"),
      v.literal("fehler"),
    ),
  ),
  createdBy: v.string(),
  orgId: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_projectId", ["projectId"])
.index("by_orgId", ["orgId"])

// NEW table: offerCriteriaResults (fulfillment per criterion per offer)
offerCriteriaResults: defineTable({
  projectId: v.id("projects"),
  offerId: v.id("offers"),
  runId: v.id("analysisRuns"),
  criterionKey: v.string(),
  criterionTitle: v.string(),
  required: v.boolean(),
  weight: v.number(),
  status: v.union(
    v.literal("erfuellt"),
    v.literal("nicht_erfuellt"),
    v.literal("teilweise"),
    v.literal("unklar"),
  ),
  comment: v.optional(v.string()),
  citations: v.array(citationSchema),
  confidence: v.optional(v.number()),
  provider: v.optional(v.string()),
  model: v.optional(v.string()),
  checkedAt: v.number(),
  orgId: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_offerId", ["offerId"])
.index("by_projectId", ["projectId"])
.index("by_projectId_offerId", ["projectId", "offerId"])
.index("by_runId", ["runId"])

// EXTEND analysisRuns to support new types/context
analysisRuns: {
  type: v.union(
    v.literal("standard"),
    v.literal("criteria"),
    v.literal("pflichtenheft_extract"),
    v.literal("offer_check"),
  ),
  offerId: v.optional(v.id("offers")),
  templateSnapshotId: v.optional(v.id("templates")),
  // ... existing fields
}
```

### Indexes
- `offers by projectId` - list all offers for comparison
- `offerCriteriaResults by offerId` - get all results for one offer
- `offerCriteriaResults by projectId` - aggregate across all offers
- `offerCriteriaResults by (projectId, offerId)` - filter for detail views
- `offerCriteriaResults by runId` - allow archiving on reruns
- `documents by projectId_role` - quickly resolve Pflichtenheft vs offers
- Migration script: backfill `projectType = "standard"` for existing rows

**Notes:**
- Each offer links to at most one document in phase 1; additional files move to "Future Enhancements".
- Template reuse relies on `projects.templateId`, avoiding parallel template pointers.
- `analysisRuns.templateSnapshotId` keeps a reference to the template version used for a run (supports audit + reruns).

---

## Backend Implementation

### Phase 1: Core CRUD Operations

**File:** `packages/backend/convex/offers.ts`

```typescript
// Mutations & Queries
- offers.create({ projectId, anbieterName, notes? })
- offers.list({ projectId })
- offers.get({ offerId })
- offers.update({ offerId, anbieterName?, notes? })
- offers.remove({ offerId })
- offers.attachDocument({ offerId, documentId })
- offers.syncRunStatus({ offerId, runId, status })
- offers.computeMetrics({ projectId }) // aggregates erfuellungsGrad on demand
```

**File:** `packages/backend/convex/offerCriteria.ts`

```typescript
// Queries
- offerCriteria.getByOffer({ offerId })
- offerCriteria.getByProject({ projectId }) // all results
- offerCriteria.getComparison({ projectId }) // aggregated matrix
- offerCriteria.archiveByRun({ runId })
```

### Phase 2: Analysis Actions

**File:** `packages/backend/convex/analysis.ts` (extend existing)

```typescript
// NEW: Extract criteria from Pflichtenheft
export const extractPflichtenheftCriteria = action({
  args: { projectId, documentId },
  handler: async (ctx, { projectId, documentId }) => {
    // 1. Load Pflichtenheft pages (documents.role === "pflichtenheft")
    // 2. Build prompt: "Extract all Muss-Kriterien and Kann-Kriterien"
    // 3. LLM call with structured output:
    //    {
    //      mussCriteria: [{ title, description, hints }],
    //      kannCriteria: [{ title, description, hints }]
    //    }
    // 4. Create/overwrite template (stored in projects.templateId):
    //    - Muss → required=true, weight=100
    //    - Kann → required=false, weight=50
    // 5. Snapshot template metadata for later offer checks
    // 6. Update analysisRuns with status
  }
});

// NEW: Check offer against criteria
export const checkOfferAgainstCriteria = action({
  args: { projectId, offerId },
  handler: async (ctx, { projectId, offerId }) => {
    // 1. Resolve active template (projects.templateId)
    // 2. Load offer's document pages
    // 3. For each criterion in template:
    //    a. Build focused prompt with criterion context
    //    b. LLM call: "Is this criterion fulfilled? Cite evidence."
    //    c. Parse result: status, comment, citations, confidence
    //    d. Insert offerCriteriaResults rows tagged with runId & template snapshot
    // 4. Finalize run metrics (prompt/completion tokens)
    // 5. Update offers.latestRunId/latestStatus
    // 6. Comparison queries compute Erfüllungsgrad from offerCriteriaResults
  }
});
```

**Supporting updates:**
- `analysis.acquireRun`, `projects.startAnalysis`, and status badge helpers accept the new `pflichtenheft_extract` & `offer_check` types.
- `projects.remove` cascades deletions into `offers` and `offerCriteriaResults` (plus purge orphaned documents).
- `documents.ts` mutations mark uploaded files with the appropriate `role`.

**Prompt Engineering Notes:**
- **Pflichtenheft Extraction**: "Du bist Experte für öffentliche Ausschreibungen. Analysiere das Pflichtenheft und extrahiere alle Muss-Kriterien und Kann-Kriterien. Antworte nur aus dem Dokument."
- **Offer Checking**: For each criterion: "Prüfe, ob das Angebot folgendes Kriterium erfüllt: [criterion]. Zitiere Beweise mit Seitenzahl."
- Reuse existing citation patterns and Zod validation

---

## Frontend Implementation

### Phase 1: Routing & Navigation

**New Routes (TanStack file router):**
```
apps/web/src/routes/projekte.$id.offerten.index.tsx    → Main comparison view
apps/web/src/routes/projekte.$id.offerten.setup.tsx    → Pflichtenheft upload & extraction
apps/web/src/routes/projekte.$id.offerten.$offerId.tsx → Offer detail view
```

**Update Existing:**
- `/projekte.tsx` → Add filter/badge for project type ("Standard" vs "Offerten")
- Project creation dialog → Add "Typ" selector (Standard / Offerten-Vergleich) and default to "Standard"
- `ProjectSectionLayout` → Accept project type to toggle navigation tabs

### Phase 2: UI Components

**File:** `apps/web/src/components/offerten/pflichtenheft-upload.tsx`
- Wrap existing document dropzone component, preselect role="pflichtenheft"
- Button: "Kriterien extrahieren"
- Loading state + live status badge (reuse `StatusBadge`)
- Display extracted criteria count

**File:** `apps/web/src/components/offerten/offer-card.tsx`
- Display: Anbieter name, computed Erfüllungsgrad (derived from query)
- Quick actions: Upload document, Run check, View details, Delete
- Status badge for latest run (reuse `StatusBadge`)

**File:** `apps/web/src/components/offerten/comparison-table.tsx`
- Matrix view rendering Convex live query data
  - Rows: Criteria (Muss first, then Kann)
  - Columns: Offers (Anbieter names)
  - Cells: Status badge (✓/✗/~/?) + hover tooltip for comment
- Totals row: Erfüllungsgrad per offer (calculated client-side from rows)
- Totals column: Count of offers per criterion

**File:** `apps/web/src/components/offerten/offer-detail.tsx`
- Criterion-by-criterion list with grouping by Muss/Kann
- Each item: Title, Status, LLM Comment, Citations (page + quote)
- Read-only override indicator (manual editing deferred to later milestone)

### Phase 3: Main Views

**`projekte.$id.offerten.setup`** (Setup Page)
1. Header: Project name, "Offerten-Vergleich Setup"
2. Section 1: Upload Pflichtenheft
   - Dropzone (reuse existing)
   - Button "Kriterien extrahieren" (disabled until uploaded)
   - Status badge + criteria count when done
3. Section 2: Review extracted criteria (optional)
   - Show template preview (read-only or link to template editor)
4. Button: "Weiter zu Offerten" → navigate to main comparison

**`projekte.$id.offerten.index`** (Main Comparison View)
1. Header: Project name, number of offers, overall stats
2. Button: "+ Neues Angebot"
3. Offer Cards Grid (board view, similar to projects):
   - Each card: Anbieter, Erfüllungsgrad, Status, Actions
4. Comparison Table (toggle view: cards vs table)
5. Export button: PDF with comparison results

**`projekte.$id.offerten.$offerId`** (Offer Detail)
1. Header: Anbieter name, Erfüllungsgrad
2. Document info: filename, pages
3. Criteria Results:
   - Left list: All criteria with status badges
   - Right panel: Selected criterion detail (comment, citations)
4. Actions: Re-run check, Delete offer

### Phase 4: Workflows

**Workflow 1: Create New Offerten Project**
1. User clicks "Neues Projekt" → Select "Offerten-Vergleich"
2. Fill: Name, Kunde, Tags
3. Redirect to `/projekte/:id/offerten/setup`
4. Upload Pflichtenheft → Extract criteria → Continue

**Workflow 2: Add Offer**
1. From main comparison view → "+ Neues Angebot"
2. Dialog: Anbieter Name, Notes (optional)
3. Create offer record
4. Upload offer document (single file, optional now, can add later)
5. If document uploaded → Button "Prüfung starten"

**Workflow 3: Run Analysis**
1. User clicks "Prüfung starten" on offer card
2. Start `checkOfferAgainstCriteria` action
3. Live status updates (wartet → läuft → fertig)
4. Results appear in comparison table
5. Erfüllungsgrad calculated and displayed

---

## Implementation Plan (Phases)

### Phase 15: Schema & Backend Core (2-3 days)

**Tasks:**
- [ ] Add `projectType` field (`standard`/`offerten`) to `projects` and backfill existing rows
- [ ] Ensure `projects.create` always sets `projectType`
- [ ] Extend `documents` table with `role` + `by_projectId_role` index
- [ ] Create `offers` table with run tracking
- [ ] Create `offerCriteriaResults` table with `runId` + weight snapshot
- [ ] Extend `analysisRuns.type` & context fields; update `analysis` helpers accordingly
- [ ] Add supporting indexes (`offers.by_projectId`, `offerCriteriaResults.by_runId`, ...)
- [ ] Implement `offers.ts` CRUD + run status mutations
- [ ] Implement `offerCriteria.ts` queries (detail, project matrix, archive)
- [ ] Update `projects.remove` to cascade delete offers/results

**Acceptance:**
- Schema deploys successfully
- Can create/list/update/delete offers via Convex dashboard
- All org guards enforced

### Phase 16: LLM Actions (3-4 days)

**Tasks:**
- [ ] Implement `extractPflichtenheftCriteria` action
  - [ ] Prompt design + testing with sample Pflichtenheft
  - [ ] Zod schema for extraction output
  - [ ] Template creation logic (reuse `templates` + update `projects.templateId`)
  - [ ] Persist template snapshot metadata on the run
- [ ] Implement `checkOfferAgainstCriteria` action
  - [ ] Prompt design per criterion
  - [ ] Parse LLM response (status, comment, citations)
  - [ ] Batch processing for all criteria
  - [ ] Store results in `offerCriteriaResults` with run/template snapshot
  - [ ] Update offers' latest run status via mutation helper
- [ ] Test with real documents (mock if needed)

**Acceptance:**
- Criteria extraction works for sample Pflichtenheft
- Offer checking produces reasonable results
- Telemetry recorded (tokens, latency)

### Phase 17: Frontend Routes & Core Components (2-3 days)

**Tasks:**
- [ ] Add "Typ" selector to project creation dialog
- [ ] Create route file: `projekte.$id.offerten.setup.tsx`
- [ ] Create route file: `projekte.$id.offerten.index.tsx`
- [ ] Create route file: `projekte.$id.offerten.$offerId.tsx`
- [ ] Build component: `pflichtenheft-upload.tsx`
- [ ] Build component: `offer-card.tsx`
- [ ] Build component: `comparison-table.tsx`
- [ ] Build component: `offer-detail.tsx`
- [ ] Add navigation sidebar link (if project type is "offerten")

**Acceptance:**
- Routes accessible and render
- Components display placeholder data
- Navigation works

### Phase 18: Frontend Integration & Workflows (3-4 days)

**Tasks:**
- [ ] Implement Setup page workflow
  - [ ] Upload Pflichtenheft
  - [ ] Trigger extraction
  - [ ] Show criteria count
  - [ ] Navigate to main comparison
- [ ] Implement main comparison view
  - [ ] List offers with cards
  - [ ] Add new offer dialog
  - [ ] Upload offer document
  - [ ] Trigger analysis
  - [ ] Live status updates
- [ ] Implement comparison table
  - [ ] Matrix rendering (criteria × offers)
  - [ ] Status badges in cells
  - [ ] Totals (per offer, per criterion)
- [ ] Implement offer detail view
  - [ ] Criteria list with status
  - [ ] Detail panel with citations
- [ ] Connect all mutations/queries to Convex

**Acceptance:**
- End-to-end flow works:
  1. Create offerten project
  2. Upload Pflichtenheft → extract criteria
  3. Add offers → upload documents → run checks
  4. View comparison table
  5. View offer details

### Phase 19: Polish & Export (1-2 days)

**Tasks:**
- [ ] Add Erfüllungsgrad visualization (progress bars, percentages)
- [ ] Export comparison to PDF (print stylesheet)
  - [ ] Include comparison table
  - [ ] Include summary statistics
  - [ ] Include per-offer details
- [ ] Add filtering/sorting to comparison table
  - [ ] Sort by Erfüllungsgrad
  - [ ] Filter by Muss vs Kann
  - [ ] Filter by status (erfüllt/nicht erfüllt)
- [ ] Error states and empty states
- [ ] Loading skeletons

**Acceptance:**
- UI polished and consistent with existing design
- PDF export works
- Filtering functional

### Phase 20: Testing & Documentation (1-2 days)

**Tasks:**
- [ ] E2E test: Full offerten workflow
- [ ] Unit test: Erfüllungsgrad calculation
- [ ] Unit test: Zod schemas for extraction/checking
- [ ] Update `tasks.md` with completion markers
- [ ] Update README with Offerten-Vergleich documentation

**Acceptance:**
- All tests pass
- Feature documented

---

## Technical Decisions & Rationale

### 1. Why Reuse Projects?
- **Consistency**: Users already understand projects
- **Infrastructure**: Auth, org guards, routing patterns already work
- **Avoid duplication**: No need for parallel "comparison" entity

### 2. Why Separate `offers` Table?
- **Clarity**: Distinct from `documents` (offers have metadata like Anbieter name)
- **Scalability**: Can have multiple offers per project, each with multiple documents
- **Flexibility**: Can add offer-specific fields (contract terms, price, etc.)

### 3. Why New `offerCriteriaResults` Table?
- **Granularity**: Need per-criterion, per-offer results
- **Performance**: Indexed lookups for matrix view
- **Auditability**: Track LLM decisions with citations

### 4. Why Not Extend `analysisResults`?
- **Schema Complexity**: Current schema is for single-document analysis
- **Query Patterns**: Different access patterns (matrix vs. single result)
- **Clarity**: Separate concerns (standard analysis vs. offer comparison)

### 5. Why Auto-Generate Template?
- **UX**: User doesn't want to manually type criteria from Pflichtenheft
- **Reusability**: Generated template can be edited, saved, reused
- **Consistency**: Same template structure used across app

---

## UX Flow Diagram

```
[Create Project: Type="Offerten"]
           ↓
[Setup: Upload Pflichtenheft] → [Extract Criteria] → [Review Template]
           ↓
[Main View: Comparison]
           ↓
[Add Offer] → [Upload Document] → [Run Check] → [View Results]
     ↓            ↓                    ↓              ↓
     ├─────────────────────────────────┴──────────────┤
     │          Repeat for each offer                  │
     └─────────────────────────────────────────────────┘
           ↓
[Comparison Table] ← [All results]
           ↓
[Export PDF]
```

---

## Performance Considerations

### LLM Calls
- **Pflichtenheft Extraction**: 1 LLM call per project (one-time setup)
- **Offer Checking**: N criteria × 1 LLM call per offer (batch in chunks if N > 20)
- **Optimization**: Cache template criteria, chunk similar criteria together

### Database Queries
- **Matrix View**: Single query for all `offerCriteriaResults` by projectId
- **Aggregation**: Calculate Erfüllungsgrad on-demand (not stored, or store as computed field)
- **Indexes**: Ensure composite index on `(projectId, offerId)` for fast lookups

### UI Rendering
- **Large Tables**: Virtualize if >50 criteria or >10 offers
- **Live Updates**: Use Convex live queries for real-time status

---

## Security & Validation

### Auth & Org Guards
- All mutations check `orgId` (reuse existing `getIdentityOrThrow`)
- Share links: Extend to include offerten projects (read-only comparison view)

### Input Validation
- Pflichtenheft upload: Same file size limits as existing
- Offer documents: Same upload pipeline
- Document roles: Validate `role` is `pflichtenheft`, `offer`, or `support`
- Anbieter name: Required, max 200 chars
- Notes: Optional, max 1000 chars

### LLM Output Validation
- Zod schemas for extraction and checking outputs
- Retry logic for malformed JSON
- Confidence threshold: Flag results with confidence < 60% for manual review

---

## Edge Cases & Error Handling

### No Criteria Extracted
- **Scenario**: LLM fails to extract criteria from Pflichtenheft
- **Handling**: Show error, allow user to manually create template or re-run extraction

### Offer Without Document
- **Scenario**: User creates offer but doesn't upload document
- **Handling**: Disable "Prüfung starten" button, show message

### Partial Results
- **Scenario**: Analysis fails mid-way through criteria
- **Handling**: Mark run as "fehler", show partial results, allow re-run

### Multiple Runs
- **Scenario**: User re-runs check after editing template
- **Handling**: Mark previous run results via `offerCriteria.archiveByRun` and insert fresh `offerCriteriaResults` scoped to the new run

---

## Future Enhancements (Out of Scope for Phase 15-20)

- [ ] Manual override of LLM status per criterion
- [ ] Custom weighting per criterion (user adjustable)
- [ ] Multi-dimensional scoring (not just erfüllt/nicht erfüllt)
- [ ] Offer ranking algorithm (weighted sum of criteria)
- [ ] Collaborative reviews (comments per offer)
- [ ] Export to Excel (vs. PDF only)
- [ ] Bulk import offers from CSV
- [ ] Template marketplace (pre-built Pflichtenheft templates)
- [ ] Support multiple documents per offer (appendices, pricing sheets)

---

## Definition of Done (Milestone)

- [ ] User can create "Offerten" project type
- [ ] User can upload Pflichtenheft and extract criteria
- [ ] User can add multiple offers with documents
- [ ] User can run automated checks per offer
- [ ] Comparison table displays all results
- [ ] Erfüllungsgrad calculated and displayed per offer
- [ ] Offer detail view shows criterion-by-criterion results
- [ ] PDF export works for comparison results
- [ ] E2E test passes for full workflow
- [ ] Feature documented in README

---

## Estimated Effort

**Total:** 12-16 days (2-3 weeks)

**Breakdown:**
- Backend: 5-7 days
- Frontend: 5-7 days
- Testing & Polish: 2-3 days

**Team:** 1 developer (full-stack)

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| LLM extraction quality varies | High | Medium | Manual review step, allow template editing |
| Large number of criteria (>100) | Medium | Medium | Chunk LLM calls, virtualize UI table |
| Offer documents in unsupported format | Low | Low | Reuse existing extraction pipeline (PDF/DOCX/TXT) |
| Performance with 20+ offers | Low | Medium | Add pagination, lazy-load results |

---

## Open Questions (to resolve before implementation)

1. **Template Editing**: Should user be able to edit auto-generated template before adding offers?
   - **Recommendation**: Yes, redirect to template editor after extraction with "Continue to Offerten" button

2. **Erfüllungsgrad Calculation**: Simple percentage or weighted by criterion importance?
   - **Recommendation**: Weighted (Muss = 100, Kann = 50), computed on demand from `offerCriteriaResults` and shown alongside raw counts

3. **Share Links**: Should offerten projects be shareable?
   - **Recommendation**: Yes, extend existing share logic to include comparison view

4. **Re-run Logic**: What happens if user re-extracts criteria after offers exist?
   - **Recommendation**: Not required for phase 1; Pflichtenheft changes are handled via a new project setup

5. **Manual Adjustments**: Should user be able to override LLM status?
   - **Recommendation**: Phase 2 feature, not in initial scope

---

## Conclusion

This milestone introduces a powerful yet simple offer comparison feature that leverages existing infrastructure. By reusing projects, documents, templates, and LLM patterns, we minimize code duplication and maintain consistency. The phased approach ensures incremental delivery with testable milestones.

**Next Step:** Review this plan with stakeholders, adjust priorities, and begin Phase 15 (Schema & Backend Core).
