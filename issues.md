# 🚨 Production-Readiness Review - Kritische Issues

**Review Datum:** 2025-09-30
**Fokus:** Logikfehler, Security, Data Integrity (80/20-Ansatz)


---

### 4. ⚠️ Fehlende Transaction bei Project Delete (CRITICAL - Data Integrity)

**Datei:** `packages/backend/convex/projects.ts:209-297`

**Problem:**
```typescript
export const remove = mutation({
    handler: async (ctx, { projectId }) => {
        // Delete shares
        const shares = await ctx.db.query("shares")...
        for (const share of shares) {
            await ctx.db.delete(share._id);
        }
        // Delete comments
        const comments = await ctx.db.query("comments")...
        for (const comment of comments) {
            await ctx.db.delete(comment._id);
        }
        // ... mehr deletes ...

        // ❌ Storage-Delete kann fehlschlagen
        try {
            await ctx.storage.delete(doc.storageId);
        } catch (e) {
            // ignore storage delete failures
        }

        await ctx.db.delete(projectId);
    },
});
```

**Issues:**
- Keine atomare Transaktion → Orphan-Records bei Fehler mittendrin
- Storage-Delete-Failures werden ignoriert → Storage Leak
- Falsche Cascade-Delete-Reihenfolge möglich

**Impact:**
- Orphaned Data: Dokumente, Kommentare, Analysis-Results bleiben in DB
- Storage-Kosten steigen: Blobs werden nicht gelöscht
- Inkonsistente Datenbank

**Fix:**
```typescript
// 1. Collect all IDs first
// 2. Delete in reverse FK dependency order
// 3. Track failed storage deletions for manual cleanup
const failedDeletes: string[] = [];

for (const doc of documents) {
    try {
        await ctx.storage.delete(doc.storageId);
    } catch (e) {
        console.error(`Storage delete failed for ${doc.storageId}: ${e}`);
        failedDeletes.push(doc.storageId);
    }
}

if (failedDeletes.length > 0) {
    console.warn(`Failed to delete ${failedDeletes.length} storage blobs`, failedDeletes);
    // TODO: Create cleanup task or alert admin
}
```

**Priorität:** 🔴 CRITICAL

---

### 5. ⚠️ Unbounded Query - Memory Overflow (CRITICAL - Performance)

**Datei:** `packages/backend/convex/analysis.ts:775-780`

**Problem:**
```typescript
const runs = await ctx.db
    .query("analysisRuns")
    .withIndex("by_projectId_type", (q) =>
        q.eq("projectId", projectId).eq("type", type),
    )
    .collect();  // ❌ Lädt ALLES in Memory!
```

Bei Projekten mit 1000+ Analysis-Runs → **Out of Memory**.

**Impact:**
- Backend-Crash bei großen Kunden
- Convex Function Timeout
- Performance degradiert linear mit Anzahl Runs

**Fix:**
```typescript
const runs = await ctx.db
    .query("analysisRuns")
    .withIndex("by_projectId_type", (q) =>
        q.eq("projectId", projectId).eq("type", type),
    )
    .order("desc") // newest first
    .take(100); // reasonable limit
```

**Priorität:** 🔴 CRITICAL

---

## 🟠 HIGH PRIORITY (vor Launch fixen)

### 6. Prompt Injection + Token Bombing (HIGH - Security + Cost)

**Datei:** `packages/backend/convex/analysis.ts:563-566`

**Problem:**
```typescript
const userPrompt = `Lies die folgenden Seiten...

Seiten:
${chunk.text}`;  // ❌ User-kontrolliert, unvalidiert
```

**Issues:**
- User-kontrollierter `chunk.text` wird direkt in LLM-Prompt injiziert
- Malicious PDF-Content kann LLM-Verhalten manipulieren
- Keine Längen-Limite → 10MB PDF = $100+ pro Analyse

**Impact:**
- Cost Explosion: Angreifer lädt riesige PDFs
- Falsche Analysis-Results durch Prompt Injection
- API-Key Exhaustion durch Rate-Limits

**Fix:**
```typescript
const MAX_PROMPT_CHARS = 50000;
if (chunk.text.length > MAX_PROMPT_CHARS) {
    throw new ConvexError("Dokumentseite zu groß für Analyse.");
}

const sanitized = chunk.text
    .replace(/ignore (all )?previous instructions/gi, "[REDACTED]")
    .replace(/system:/gi, "[REDACTED]");

const userPrompt = `Lies die folgenden Seiten...\n\nSeiten:\n${sanitized}`;
```

**Priorität:** 🟠 HIGH

---

### 7. Race Condition: Analysis Queue Limit (HIGH - Cost)

**Datei:** `packages/backend/convex/projects.ts:137-178`

**Problem:**
```typescript
const activeRuns = await ctx.db
    .query("analysisRuns")
    .withIndex("by_orgId", (q) => q.eq("orgId", identity.orgId))
    .collect();

const activeCount = activeRuns.filter(
    (run) => run.status === "wartet" || run.status === "läuft",
).length;

const shouldStartImmediately = activeCount < maxActive;

const runId = await ctx.db.insert("analysisRuns", {
    status: shouldStartImmediately ? "läuft" : "wartet",
    // ...
});
```

Zwei gleichzeitige Calls sehen beide `activeCount < maxActive` → beide starten → Limit überschritten.

**Impact:**
- Cost Overrun: Mehr parallele LLM-Calls als budgetiert
- Rate-Limit Violations: 429 Errors von OpenAI
- Inkonsistente Queue

**Fix:**
- Optimistic Locking mit Version Counter
- ODER: Dedizierter Cron Job aktiviert Runs atomisch

**Priorität:** 🟠 HIGH

---

### 8. Memory Leak: File Upload ohne Cleanup (HIGH - Frontend)

**Datei:** `apps/web/src/routes/projekte.tsx:562-632`

**Problem:**
```typescript
const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
        for (const file of standardFiles) {
            await uploadAndExtract(projectId, file);
        }
        // ❌ Kein Cleanup wenn Component unmounted
```

Wenn User Dialog während Upload schließt → async Operationen laufen weiter.

**Impact:**
- State Updates auf unmounted Components → React Warnings
- Memory Leaks
- Fehlerhafte Toasts nach Dialog-Close

**Fix:**
```typescript
useEffect(() => {
    const abortController = new AbortController();

    return () => {
        abortController.abort();
    };
}, []);

// Pass signal to all async operations
await uploadAndExtract(projectId, file, { signal: abortController.signal });
```

**Priorität:** 🟠 HIGH

---

### 9. Unbounded State Array - Offer Uploads (HIGH - Frontend)

**Datei:** `apps/web/src/routes/projekte.$id.offerten.setup.tsx:242-337`

**Problem:**
```typescript
const [offerUploads, setOfferUploads] = useState<OfferUploadState[]>([]);

for (const file of acceptedFiles) {
    setOfferUploads((previous) => [
        ...previous,
        { id: uploadId, filename: file.name, status: "uploading" },
    ]);
    // ❌ Niemals Cleanup!
```

Array wächst unbegrenzt, keine Cleanup-Logik.

**Impact:**
- Performance-Degradation durch unnötige Re-Renders
- Memory wächst kontinuierlich
- UI wird langsamer nach vielen Uploads

**Fix:**
```typescript
// Cleanup nach 30 Sekunden
useEffect(() => {
    const cleanup = setInterval(() => {
        setOfferUploads(prev =>
            prev.filter(upload =>
                upload.status === "uploading" ||
                Date.now() - upload.timestamp < 30000
            )
        );
    }, 10000);

    return () => clearInterval(cleanup);
}, []);
```

**Priorität:** 🟠 HIGH

---

### 10. Missing Error Boundary - PDF Extraction (HIGH - Frontend)

**Datei:** `apps/web/src/lib/extract-text.ts:12-48`

**Problem:**
```typescript
export async function extractDocumentPages(file: File): Promise<ExtractedPage[]> {
    const mimeType = file.type || inferMimeType(file.name);
    if (mimeType === "application/pdf") {
        return await extractPdf(file);  // ❌ Kann crashen bei korruptem PDF
    }
    // Kein try-catch → Error propagiert unhandled
}
```

**Impact:**
- Korrupte PDFs crashen den Upload-Flow
- User sieht keine hilfreiche Fehlermeldung
- State bleibt in "uploading" stuck

**Fix:**
```typescript
export async function extractDocumentPages(file: File): Promise<ExtractedPage[]> {
    try {
        const mimeType = file.type || inferMimeType(file.name);
        if (mimeType === "application/pdf") {
            return await extractPdf(file);
        }
        // ... rest
    } catch (error) {
        throw new Error(
            `Fehler beim Verarbeiten von "${file.name}": ${
                error instanceof Error ? error.message : "Unbekannter Fehler"
            }`
        );
    }
}
```

**Priorität:** 🟠 HIGH

---

## 🟡 MEDIUM PRIORITY (nach Launch fixen)

### 11. Cross-Project-Document-Attachment (MEDIUM - Data Integrity)

**Datei:** `packages/backend/convex/offers.ts:135-158`

**Problem:** `document.projectId` wird nicht mit `offer.projectId` verglichen → User kann Dokumente aus fremden Projekten an Offers anhängen.

**Fix:**
```typescript
if (document.projectId !== offer.projectId) {
    throw new Error("Document gehört nicht zum selben Projekt wie das Angebot.");
}
```

---

### 12. N+1 Query in loadLatestRuns (MEDIUM - Performance)

**Datei:** `packages/backend/convex/projects.ts:299-339`

**Problem:** Für 50 Projekte → 50 separate DB-Queries.

**Partial Fix:**
```typescript
// Load all runs for org, filter in-memory
const allRuns = await ctx.db
    .query("analysisRuns")
    .withIndex("by_orgId", (q) => q.eq("orgId", orgId))
    .collect();
```

---

### 13. Orphaned Storage bei Document Delete Failure (MEDIUM)

**Datei:** `packages/backend/convex/projects.ts:284-289`

**Problem:** Storage-Delete-Errors werden ignoriert → Blobs bleiben, DB-Referenz weg.

**Fix:** Log failed deletes, create cleanup task.

---

### 14. XSS Risk in Citations (MEDIUM - Security)

**Datei:** `apps/web/src/components/criteria-panel/criteria-detail.tsx:71-82`

**Problem:**
```typescript
<p className="mt-1 italic">„{citation.quote}"</p>  // ❌ User-controlled
```

**Fix:** Sanitize mit DOMPurify oder verwende `textContent`.

---

### 15. Race Condition - Doppeltes Offer Creation (MEDIUM - Frontend)

**Datei:** `apps/web/src/routes/projekte.$id.offerten.setup.tsx:125-168`

**Problem:** `ensureOfferForDocument` Ref-basierte Deduplizierung ist nicht atomic.

**Fix:** Optimistic UI Pattern oder Backend-side Deduplication.

---

### 16. window.location.href statt Router (MEDIUM - UX)

**Datei:** `apps/web/src/routes/projekte.tsx:237+` (multiple Stellen)

**Problem:** Full Page Reload statt SPA Navigation.

**Fix:** Verwende `navigate()` von TanStack Router.

---

### 17. Fehlende Rate-Limits (MEDIUM - Security)

**Datei:** `packages/backend/convex/documents.ts:19-68`

**Problem:** User kann 1000 Requests parallel senden, keine Per-User-Limits.

**Fix:**
```typescript
const MAX_DOCUMENTS_PER_PROJECT = 100;
if (existingDocuments.length >= MAX_DOCUMENTS_PER_PROJECT) {
    throw new Error("Maximale Anzahl Dokumente pro Projekt erreicht.");
}
```

---

### 18. Unhandled Promise Rejection - Clipboard (MEDIUM - UX)

**Datei:** `apps/web/src/components/share-link.tsx:44`

**Problem:**
```typescript
onClick={() => navigator.clipboard.writeText(shareUrl)}  // ❌ Unhandled Promise
```

**Fix:** Async handler mit try-catch und Toast Feedback.

---

### 19. Missing Loading States (MEDIUM - UX)

**Dateien:**
- `apps/web/src/routes/projekte.$id.dokumente.tsx:135-224`
- `apps/web/src/routes/projekte.$id.kriterien.tsx:182-206`

**Problem:** Keine Loading States während async Operationen → User kann mehrfach klicken.

**Fix:** Loading State mit Loader Icon und disabled Buttons.

---

### 20. useEffect Loop Risk (MEDIUM - Frontend)

**Datei:** `apps/web/src/routes/projekte.$id.offerten.$offerId.tsx:70-78`

**Problem:** `selectedId` ist Dependency und wird im Effect gesetzt → Loop-Risiko.

**Fix:** Verwende useRef oder conditional Logic.

---

## ⚪ LOW PRIORITY (Tech Debt)

### 21. Type Casting überall (LOW)

**Problem:** Überall `as any` für IDs verwendet → TypeScript kann keine Errors catchen.

**Fix:** Proper Type Definitions für Convex IDs.

---

### 22. Fehlende Abort für Long-Running PDF Extraction (LOW)

**Datei:** `apps/web/src/lib/extract-text.ts:30-48`

**Problem:** Bei 1000-Seiten PDF hängt Browser, kein Abort möglich.

**Fix:** Implementiere AbortSignal support.

---

### 23. Client-side Validation only (LOW)

**Datei:** `apps/web/src/routes/projekte.tsx:636-655`

**Problem:** Nur HTML5 validation, kann mit DevTools umgangen werden.

**Fix:** Explizite JavaScript validation.

---

### 24. Fehlende Per-File Size Check (LOW)

**Datei:** `apps/web/src/components/upload-dropzone.tsx:27-59`

**Problem:** Nur Total-Size-Check, einzelne 300MB Datei würde akzeptiert.

**Fix:** Zusätzlicher per-File Size Check (max 50MB).

---

### 25. Fehlende strukturierte Error-Info bei LLM JSON-Parsing (LOW)

**Datei:** `packages/backend/convex/analysis.ts:1108-1140`

**Problem:** Error-Message enthält rohen LLM-Output → potentieller Data Leak in Logs.

**Fix:** Strukturierte Error-Objekte ohne Sensitive Data.

---

## 📊 Zusammenfassung nach Priorität

### 🔴 PRODUCTION BLOCKER (5 Issues)
1. Auth-Bypass via ENV
2. Unsichere Token-Generierung
3. Infinite Loop Share Creation
4. Fehlende Transaction bei Project Delete
5. Unbounded Queries

### 🟠 HIGH PRIORITY (5 Issues)
6. Prompt Injection + Token Bombing
7. Race Condition Analysis Queue
8. Memory Leak File Upload
9. Unbounded State Arrays
10. Missing Error Boundary PDF

### 🟡 MEDIUM PRIORITY (15 Issues)
11-25: Data Integrity, Performance, UX Issues

### ⚪ LOW PRIORITY (Tech Debt)
Type Safety, Optimierungen, Edge Cases

---

## 🎯 Empfohlene Fix-Reihenfolge

**Sprint 1 (SOFORT):**
1. Auth-Bypass fixen + Deployment-Audit
2. Token-Generation kryptographisch sichern
3. Share-Creation Race Condition + Infinite Loop

**Sprint 2 (vor Launch):**
4. Project Delete atomarer machen
5. Unbounded Queries limitieren
6. Memory Leaks Frontend fixen
7. Error Boundaries implementieren

**Sprint 3 (nach Launch):**
8. Prompt Injection Protection
9. Rate Limiting
10. Performance-Optimierungen (N+1 Queries)

**Backlog:**
- Type Safety improvements
- UX Enhancements
- Tech Debt Cleanup

---

**Review erstellt am:** 2025-09-30
**Nächstes Review:** Nach Implementierung der TOP 5