## `tasks.md`

> **Scope guardrails (read first)**
>
> * Implement **only** what’s in the PRD for **tendera.ch**. No extra features, no detours.
> * German UI copy. Keep design minimal (shadcn/ui + Tailwind).
> * **No OCR**, **no ZIP uploads**, **no roles/collab**, **no Word/Markdown export**.
> * Keep **Clerk Orgs in place**, but **don’t build collaboration/permissions** beyond orgId scoping.
> * Live reactivity must use **Convex Live Queries**.
> * LLM calls run **server‑side in Convex Actions** with provider switch via ENV.
> * Target: UC1–UC5 complete; UC6 (Kommentare/Aufgaben) **optional** at the end.

---

### Phase 0 — Repo hygiene & skeleton

**Goal:** Prepare navigation, titles, ENV placeholders, and a clean surface for MVP routes.

* [x] Update titles:

  * [x] `apps/web/index.html` → title `tendera.ch`
  * [x] `apps/web/src/routes/__root.tsx` head meta title → `tendera.ch`
* [x] Update navbar links in `apps/web/src/components/header.tsx`:

  * [x] **Replace** “Aufgaben” with: **Projekte** (`/projekte`), **Templates** (`/templates`), **Profil**, \*\*Organisation\`\`
* [x] Keep `/todos` route for now but **remove** header link to it.
* [x] Add ENV placeholders:

  * [x] `apps/web/.env.example`: add `MAX_UPLOAD_MB=200`
  * [x] `packages/backend/convex/auth.config.ts` already expects `CLERK_JWT_ISSUER_DOMAIN`. Ensure placeholder in `packages/backend/.env.local` (commented).
  * [x] `packages/backend/.env.local`: add commented placeholders for `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `LLM_PROVIDER`, `LLM_MODEL`.

**Acceptance:**

* Header shows: Startseite, Projekte, Templates, Profil, Organisation.
* App builds and runs unchanged.

---

### Phase 1 — Convex schema (data model + indexes)

**Goal:** Add all tables from PRD §6 with pragmatic indexes.

**Files:** `packages/backend/convex/schema.ts`

**Tasks:**

* [x] Append tables (do not remove `todos`):

  * [x] `projects` → `name`, `customer`, `tags[]`, `templateId?`, `latestRunId?`, `orgId`, `createdBy`, `createdAt`
  * [x] `documents` → `projectId`, `filename`, `mimeType`, `size`, `storageId`, `pageCount?`, `textExtracted (bool)`, `orgId`, timestamps
  * [x] `docPages` → `documentId`, `page (number)`, `text (string)`, `orgId`
  * [x] `templates` → fields per PRD incl. `criteria[]` object array + `visibleOrgWide (bool)`, `orgId`, timestamps
  * [x] `analysisRuns` → `projectId`, `type ("standard" | "criteria")`, `status ("wartet" | "läuft" | "fertig" | "fehler")`, `error?`, `startedAt`, `finishedAt`, `resultRef?`, **telemetry fields**: `provider`, `model`, `promptTokens?`, `completionTokens?`, `latencyMs?`, `orgId`
  * [x] `analysisResults` → per PRD result shapes (standard/criteria), `orgId`
  * [x] `shares` → `projectId`, `token (string)`, `expiresAt`, `createdBy`, `orgId`
  * [ ] *(Optional / Should)* `comments`, `tasks` as in PRD
* [x] Indexes:

  * [x] `documents` by `projectId`
  * [x] `docPages` by `documentId` and secondary composite `(documentId, page)`
  * [x] `analysisRuns` by `projectId`, and composite `(projectId, type)`; also `orgId` for backpressure queries
  * [x] `analysisResults` by `result type` if needed, and by `_id`
  * [x] `shares` by `token` (unique), and by `projectId`
  * [x] `templates` by `orgId` and `visibleOrgWide`

**Acceptance:**

* `npx convex dev` boots with new schema.
* Indexes exist and compile.

---

### Phase 2 — Auth & org guard helpers

**Goal:** Enforce org multi‑tenancy on every function.

**Files:** `packages/backend/convex/` (new helper), update all functions later to use it.

**Tasks:**

* [x] Create `auth.ts` with helper:

  * [x] `getIdentityOrThrow(ctx)` → returns `{ userId, orgId, email }`, throws if missing.
  * [x] `requireOrgFilter(ctx, orgId)` guidance: every query/mutation must filter by `orgId`.
* [x] Ensure Clerk JWT template “convex” includes org claim (e.g. `org_id`). In code, read that claim from `ctx.auth.getUserIdentity()`.

**Acceptance:**

* Any call without auth returns a controlled error.
* All subsequent functions will call this helper.

---

### Phase 3 — Convex: Queries & Mutations (CRUD)

**Files:** `packages/backend/convex/*.ts`

**Tasks:**

* [ ] `projects.create({ name, customer, tags, templateId? })` → returns `Id`
* [ ] `projects.list({ filter? })` (by name/tag) scoped by `orgId`
* [ ] `projects.get({ projectId })`
* [ ] `documents.createUploadUrl()` → Convex storage upload URL (per Convex file upload pattern)
* [ ] `documents.attach({ projectId, filename, mimeType, size, storageId })`
* [ ] `documents.listByProject({ projectId })`
* [ ] `docPages.bulkInsert({ documentId, pages: [{ page, text }] })` → fast insert
* [ ] `templates.list()` (org‑scoped + `visibleOrgWide`)
* [ ] `templates.get({ templateId })`
* [ ] `templates.upsert({...})` (create/update incl. `criteria[]`)
* [ ] `projects.startAnalysis({ projectId, type })`

  * [ ] Creates `analysisRuns` with `status="wartet"`; saves `startedAt` when moved to `"läuft"`.
  * [ ] **Backpressure:** If there are N active (`"wartet"|"läuft"`) runs for this `orgId`, enqueue (N configurable; default 1 per org).
* [ ] `shares.create({ projectId, ttlDays })` → returns `{ token, expiresAt }`
* [ ] `shares.resolve({ token })` → returns sanitized read‑only payload for UI (project meta + last standard result + last criteria result if present). **No live editing.**

**Acceptance:**

* All endpoints validate orgId and throw on cross‑org access.
* Starting an analysis enqueues a run.

---

### Phase 4 — Convex Actions (LLM & extraction)

**Files:** `packages/backend/convex/analysis.ts`, `packages/backend/convex/extract.ts`, `packages/backend/convex/llm.ts`

**Tasks:**

* [ ] `extract.textFromFile({ storageId, mimeType })` → `{ pages: [{ page, text }] }`

  * Preferred path is **client‑side** extraction (see Phase 7), but provide server Action for fallback (TXT supported; PDF/DOCX may be limited if libs are problematic).
* [ ] `analysis.runStandard({ projectId, docPageIds[] })`

  * [ ] Chunk `docPages` by page windows (e.g. 8–12 pages per chunk).
  * [ ] Build **strict prompt** enforcing **German output** and **JSON schema** from PRD §9.
  * [ ] Anti‑hallucination: instruct “**answer only from provided pages**”, require citations (`page` + short `quote`) for every fact.
  * [ ] Merge chunk outputs (dedupe + keep sources).
  * [ ] Validate with Zod (schema mirrors PRD JSON).
  * [ ] Write `analysisResults` and finalize `analysisRuns` with telemetry (`tokens`, `latencyMs`, `provider`, `model`).
* [ ] `analysis.runCriteria({ projectId, templateId, docPageIds[] })`

  * [ ] For each criterion, build a constrained prompt with the criterion context and same citation rule.
  * [ ] Output JSON per PRD; Zod‑validate; store result.
* [ ] `analysis.getLatest({ projectId, type })` → returns `{ status, result? }` (reactive query).
* [ ] `llm.ts`: provider switch

  * [ ] Read `LLM_PROVIDER` (`"OPENAI" | "ANTHROPIC"`) and `LLM_MODEL`.
  * [ ] Normalized call that returns `{ text, usage: { promptTokens, completionTokens }, latencyMs }`.
  * [ ] If model/provider missing → throw descriptive error.

**Acceptance:**

* Can run Actions with mocked pages (unit test locally).
* Run status transitions: `wartet → läuft → fertig|fehler` update correctly; telemetry recorded.

---

### Phase 5 — Frontend routing & scaffolding

**Files:** `apps/web/src/routes/...`, `apps/web/src/components/...`

**Tasks (routes to create):**

* [ ] `/projekte` → `routes/projekte.tsx` (list + “Neues Projekt” dialog)
* [ ] `/projekte/:id/standard` → `routes/projekte.$id.standard.tsx`
* [ ] `/projekte/:id/kriterien` → `routes/projekte.$id.kriterien.tsx`
* [ ] `/projekte/:id/dokumente` → `routes/projekte.$id.dokumente.tsx`
* [ ] `/projekte/:id/export` → `routes/projekte.$id.export.tsx`
* [ ] `/templates` → `routes/templates.tsx`
* [ ] `/templates/:templateId` → `routes/templates.$id.tsx`
* [ ] `/share/:token` (read‑only view) → `routes/share.$token.tsx`

**UI components (new under `apps/web/src/components/`):**

* [ ] `status-badge.tsx` → maps run status to badge styles
* [ ] `upload-dropzone.tsx` → accepts multiple files (PDF/DOCX/TXT), enforces **sum ≤ MAX\_UPLOAD\_MB**
* [ ] `analysis-cards/*` → small card components for Summary, Milestones, Requirements, Open Questions, Metadata
* [ ] `criteria-panel/*` → left list with status badges + right detail panel (citations with page numbers)
* [ ] `pdf-export-button.tsx` → triggers print‑to‑PDF or client PDF render
* [ ] `share-link.tsx` → create & display copyable read‑only link

**Acceptance:**

* Navigation works; routes mount without runtime errors.
* Placeholder UIs render.

---

### Phase 6 — UC1: Projekt & Upload

**Goal:** Create project, upload multiple files, store in Convex storage, extract text to `docPages`, and show a reactive **Run** status.

**Tasks:**

* [ ] `/projekte`:

  * [ ] Table/List of projects (name, customer, tags, updatedAt, latest status badge).
  * [ ] “Neues Projekt” dialog: fields **Projektname**, **Kunde/Behörde**, **interne Tags**, optional **Template** select.
* [ ] `/projekte/:id/dokumente`:

  * [ ] Dropzone: accept PDF/DOCX/TXT; **multiple**; **sum ≤ MAX\_UPLOAD\_MB**; show per‑file chips with validation.
  * [ ] Upload flow: call `documents.createUploadUrl()` → upload file → `documents.attach(...)`.
  * [ ] **Client‑side text extraction** immediately after attach (preferred):

    * PDF: `pdfjs-dist` → per‑page text.
    * DOCX: `mammoth` → split into pseudo‑pages by headings/length heuristic; record `page` starting at 1.
    * TXT: single page.
  * [ ] Save pages via `docPages.bulkInsert`.
  * [ ] Mark `documents.textExtracted = true`, `pageCount`.
  * [ ] Button(s): **„Standard‑Analyse starten“**, **„Kriterien‑Analyse starten“** (disabled until at least one page exists).
  * [ ] Show an **Analysis Runs** section with live status.

**Acceptance:**

* Uploads work for PDF/DOCX/TXT within configured limit.
* After upload: pages appear in DB; starting analysis enqueues a run and status updates reactively.

---

### Phase 7 — UC2: Standard‑Ansicht

**Goal:** Display full **Standard‑Ansicht** from latest standard run per PRD.

**Tasks (`/projekte/:id/standard`):**

* [ ] Header: project meta (Name, Kunde, Tags) + **Status** badge of latest standard run.
* [ ] Cards:

  * [ ] **Executive Summary** (\~200–300 Wörter)
  * [ ] **Meilensteine/Fristen** (label + ISO date + citation `{page, quote}`)
  * [ ] **Wesentliche Anforderungen** (functional / non‑functional) with citation for each item
  * [ ] **Eignungskriterien** & **Ausschlusskriterien** with citation
  * [ ] **Offene Punkte/Unklarheiten** with citation
  * [ ] **Metadaten** (tenderId, authority, term, budget) + `sources[]` with citations
* [ ] Empty/none states when result is missing.

**Acceptance:**

* All items show citations with page numbers.
* Live status transitions update UI automatically via `analysis.getLatest`.

---

### Phase 8 — UC3: Kriterien‑Ansicht

**Goal:** Select a template (now or later), run criteria analysis, show **Gefunden/Nicht gefunden**, references and comment.

**Tasks (`/projekte/:id/kriterien`):**

* [ ] If project has no template: dropdown to pick one from `/templates`.
* [ ] Show **left list** of criteria with status chips (Gefunden/ Nicht gefunden/ n. v.).
* [ ] **Right detail**: for selected criterion show:

  * [ ] `references[]` as list of **Zitat** + **Seite** (documentId not shown, but kept for deep‑link later)
  * [ ] `comment` (LLM interpretation)
  * [ ] *(Should)* score if provided
* [ ] “Kriterien‑Analyse starten” button (re‑run allowed).

**Acceptance:**

* At least one found and one not found item with citations display correctly.

---

### Phase 9 — UC4: Template‑Verwaltung

**Goal:** CRUD for templates including `criteria[]`.

**Tasks:**

* [ ] `/templates` list: name, version, language, visibleOrgWide.
* [ ] `/templates/:id` editor:

  * [ ] Fields: Name, Beschreibung, Sprache, Version, Sichtbarkeit.
  * [ ] Criteria table/editor: Titel, Beschreibung, Hinweise/Beispiele, Antworttyp (Boolean/Skala/Text), Gewicht (0–100), Pflicht (ja/nein), *(optional)* Keywords.
  * [ ] Save via `templates.upsert`.
* [ ] Templates are **org‑scoped**; `visibleOrgWide` shows to all members of the org.

**Acceptance:**

* Create/edit template, add criteria, re‑use template on project.

---

### Phase 10 — UC5: Export (PDF) & Sharable Link

**Tasks:**

* [ ] `/projekte/:id/export`:

  * [ ] Render a **print‑optimized** combined view (Standard + Criteria sections) mirroring on‑screen structure.
  * [ ] Footer per page: project name + export date.
  * [ ] Export button → **client‑side** print‑to‑PDF (ensure citations visible).
* [ ] **Read‑only share**:

  * [ ] Button “Link teilen” opens dialog: pick TTL (e.g., 7 Tage) → call `shares.create`.
  * [ ] Construct share URL on client: `${origin}/share/${token}` (do **not** store origin server‑side).
  * [ ] `/share/:token` route:

    * [ ] Calls `shares.resolve` (no auth). If valid, show read‑only Standard + Criteria results; **no upload, no edits**.
    * [ ] If expired/invalid → friendly error.

**Acceptance:**

* Generated PDF preserves all content and page citations.
* Share link loads without login, read‑only.

---

### Phase 11 — UC6 *(Should, optional)*: Kommentare & Aufgaben

**Tasks (only after MVP green):**

* [ ] `/projekte/:id/kommentare` or inline comment drawers:

  * [ ] Add simple `comments.add` mutation.
  * [ ] Optional `tasks.create|toggle|delete` using existing `/todos` patterns.
* [ ] Scope strictly to per‑project; no assignments beyond a free‑text `assignee?` string.

**Acceptance:**

* Can add a comment to a milestone/criterion; persists; lists chronologically.

---

### Phase 12 — Observability, backpressure & health

**Tasks:**

* [ ] **Telemetry**: In Actions, record `promptTokens`, `completionTokens`, `latencyMs`, `provider`, `model` on the `analysisRuns` row.
* [ ] **Backpressure**:

  * [ ] In `projects.startAnalysis`, if existing `"wartet"|"läuft"` count for `orgId` ≥ limit, keep `status="wartet"`.
  * [ ] Background worker (Action) or on‑demand runner picks the next `"wartet"` for `orgId` to `"läuft"`.
* [ ] **Status page**:

  * [ ] Minimal: page or console log using `healthCheck.get` returning `"OK"`.

**Acceptance:**

* Starting a run in one org while one is active queues the next.
* Telemetry is visible on `analysisRuns` records.

---

### Phase 13 — Testing (E2E + unit)

**Tasks:**

* [ ] Add Playwright (or Cypress) to root:

  * [ ] Script: `npm run test:e2e`
  * [ ] Basic fixtures for auth (skip if not needed; tests can rely on public share route).
* [ ] **E2E Cases** (per PRD §15):

  1. Upload **multiple files** (PDF+DOCX) → start Standard run → status `fertig`.
  2. Standard‑Ansicht shows **Summary**, **Milestones (with date + citation)**, **Requirements**, **Open Questions**, **Metadata**.
  3. Kriterien‑Ansicht with a template: at least one **Gefunden** (with Zitat+Seite) and one **Nicht gefunden**.
  4. PDF‑Export includes citations and sections.
  5. Share link loads **without login**, is **read‑only**, and **expires**.
* [ ] Unit tests for Zod schemas (standard/criteria outputs).

**Acceptance:**

* All 5 E2E tests green locally.

---

### Phase 14 — Polishing & cleanup

**Tasks:**

* [ ] Replace Startseite copy to reflect tendera’s purpose.
* [ ] Remove `/todos` page or link it under `/projekte/:id/kommentare` if reused.
* [ ] Review ENV usage: ensure **no server secrets** leak to client.
* [ ] README update: quickstart for tendera (Clerk, Convex, ENV, run commands).

**Acceptance:**

* App demoable end‑to‑end for a 30–50 page PDF within the performance budget (first results < 60s, full 3–5 min, excluding OCR).

---

### Implementation notes (non‑code but binding)

* **File size validation:** enforce **total** size ≤ `MAX_UPLOAD_MB`. Show sum in UI.
* **Citations:** every extracted item must include at least one `{ page, quote }`. For DOCX “pages”, use a deterministic heuristic; label as **“Seite (heuristisch)”** in UI if needed.
* **Prompts:** Keep German instructions, “Antwort nur aus diesen Seiten”, and strict JSON. If JSON parse fails, re‑ask once with a *“strict JSON, no prose”* system message.
* **Security:** All queries/mutations/actions enforce `orgId`. Share tokens grant read‑only access to results only (never to raw document files).
* **Provider switch:** `LLM_PROVIDER=OPENAI|ANTHROPIC`, `LLM_MODEL` required. If not set, actions must throw with helpful error.
* **Indexes:** Use them on all high‑fanout lookups (`documents by projectId`, `docPages by documentId`, `shares by token`, runs by `projectId,type`).
* **Styling:** Use existing shadcn components; keep cards clean; avoid custom heavy libs for PDF—prefer print stylesheet.
* **Telemetry storage:** don’t store raw prompts or document text in results—only outputs and token/latency counters.

---

## Definition of Done (MVP)

* UC1–UC5 fully implemented; UC6 optional.
* Upload → Extract → Analyze → Display → Export works E2E for PDF/DOCX/TXT.
* Share link works read‑only without login and can expire.
* ≥5 E2E tests pass.
* Telemetry recorded per run.
* Auth/org guard enforced in every backend function.

---

## Commit & PR etiquette (for Codex)

* Use Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`).
* Keep PRs small per phase; include a short checklist referencing tasks above.
* Never introduce features not listed here.

---

## Initial ENV checklist

* Web:

  * `VITE_CONVEX_URL=...`
  * `VITE_CLERK_PUBLISHABLE_KEY=...`
  * `MAX_UPLOAD_MB=200`
* Backend (Convex):

  * `CLERK_JWT_ISSUER_DOMAIN=...`
  * `OPENAI_API_KEY=...` (if using OPENAI)
  * `ANTHROPIC_API_KEY=...` (if using ANTHROPIC)
  * `LLM_PROVIDER=OPENAI` (or `ANTHROPIC`)
  * `LLM_MODEL=...` (e.g., `gpt-4o-mini`, `claude-3-5-sonnet`)

---

## Folder/file map to add

* `packages/backend/convex/`

  * `auth.ts` (helper)
  * `projects.ts`, `documents.ts`, `docPages.ts`, `templates.ts`, `shares.ts`
  * `analysis.ts`, `extract.ts`, `llm.ts`
* `apps/web/src/routes/`

  * `projekte.tsx`, `projekte.$id.standard.tsx`, `projekte.$id.kriterien.tsx`, `projekte.$id.dokumente.tsx`, `projekte.$id.export.tsx`
  * `templates.tsx`, `templates.$id.tsx`
  * `share.$token.tsx`
* `apps/web/src/components/`

  * `status-badge.tsx`, `upload-dropzone.tsx`, `analysis-cards/*`, `criteria-panel/*`, `pdf-export-button.tsx`, `share-link.tsx`

---

## Performance budget (bind to PRD §11)

* First visible results < **60 s** on \~50 pages (Standard run can stream or partial update via live query).
* Full pass < **3–5 min** (no OCR).
* Max concurrent active runs per org: **1** (configurable).

---

## Risks & mitigations (bind to PRD §12)

* **Hallucinations** → strict page‑bounded prompts + mandatory citations + Zod validation.
* **DOCX pagination** → heading/length heuristic; mark pages as heuristic in UI.
* **Large files** → client extraction to avoid server PDF libs; chunking in Actions.
