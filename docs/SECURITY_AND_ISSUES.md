# Security Model and Known Issues

**Last Updated:** 2026-01-16
**Status:** ⚠️ ATTENTION BEFORE PRODUCTION (Open Critical: Issue #4, Issue #5)

---

## Table of Contents

1. [Security Model](#security-model)
2. [Critical Issues (Production Blockers)](#critical-issues-production-blockers)
3. [High Priority Issues](#high-priority-issues)
4. [Medium Priority Issues](#medium-priority-issues)
5. [Mitigation Roadmap](#mitigation-roadmap)
6. [Security Best Practices](#security-best-practices)

---

## Security Model

### Multi-Tenant Architecture

**Organization Isolation:** Every backend function enforces organization-based access control.

```typescript
// packages/backend/convex/auth.ts
export async function getIdentityOrThrow(ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Nicht authentifiziert");

  const orgId = identity.org_id; // From Clerk JWT claim
  if (!orgId) throw new Error("Keine Organisation");

  return { userId: identity.subject, orgId, email: identity.email };
}
```

**Enforcement Pattern:**
```typescript
export const someFunction = query({
  handler: async (ctx, args) => {
    const identity = await getIdentityOrThrow(ctx);

    const resource = await ctx.db.get(args.resourceId);
    if (!resource || resource.orgId !== identity.orgId) {
      throw new Error("Nicht berechtigt");
    }
    // ... authorized operation
  }
});
```

### Authentication Flow

```
┌─────────────────────────────────────────────────────────┐
│ User Browser                                            │
└─────────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│ Clerk (Authentication)                                  │
├─────────────────────────────────────────────────────────┤
│ • User signs in with email/password                     │
│ • Clerk issues JWT with claims:                         │
│   - sub: userId                                         │
│   - org_id: organizationId (custom claim)              │
│   - email: user@example.com                             │
└─────────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│ Convex Backend                                          │
├─────────────────────────────────────────────────────────┤
│ • Validates JWT signature                               │
│ • Extracts claims from token                            │
│ • Every function calls getIdentityOrThrow()             │
│ • Filters all queries by orgId                          │
└─────────────────────────────────────────────────────────┘
```

### Data Access Layers

| Layer | Control | Implementation |
|-------|---------|----------------|
| **Authentication** | User identity verification | Clerk JWT validation |
| **Organization** | Org-level isolation | `orgId` filter on all queries |
| **Project** | Project-level access | Verified via `project.orgId` |
| **Document** | Document-level access | Verified via `document.projectId` → `project.orgId` |

### Share Link Security

**Purpose:** Read-only external access without authentication

**Implementation:**
```typescript
// Token generation (cryptographically secure)
const token = generateShareToken(); // 32 bytes, crypto.getRandomValues()

// Time-limited expiration
const expiresAt = Date.now() + (ttlDays * 86400000);

// Stateless resolution
export const resolve = query({
  handler: async (ctx, { token }) => {
    const share = await ctx.db.query("shares")
      .withIndex("by_token", q => q.eq("token", token))
      .first();

    if (!share) throw new Error("Ungültiger Link");
    if (share.expiresAt && Date.now() > share.expiresAt) {
      throw new Error("Link abgelaufen");
    }

    // Return sanitized data (NO raw documents, NO edit permissions)
    return {
      project: { name, customer, tags },
      standardResult: { /* ... */ },
      criteriaResult: { /* ... */ },
    };
  }
});
```

**Security Properties:**
- **256-bit entropy:** Brute-force infeasible
- **No session state:** Stateless authentication
- **Read-only:** No mutations allowed
- **No document files:** Only processed analysis results
- **Time-limited:** Configurable expiration

---

### 🔴 Issue #2: Weak Token Generation Fallback

**Severity:** CRITICAL - Security Vulnerability
**File:** `packages/backend/convex/shares.ts`
**Status:** ✅ FIXED (2026-01-16)

**Resolution:**
Fallback to `Math.random()` was removed. Token generation now requires
cryptographically secure randomness and fails fast if unavailable.

**Current Implementation:**
```typescript
function fillRandomBytes(bytes: Uint8Array) {
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
    return;
  }
  throw new Error(
    "Kryptographisch sichere Zufallszahlen nicht verfügbar. " +
    "Token-Generierung abgebrochen."
  );
}
```

**Priority:** ✅ RESOLVED

---

### 🔴 Issue #3: Infinite Loop in Token Generation

**Severity:** CRITICAL - Availability
**File:** `packages/backend/convex/shares.ts`
**Status:** ✅ FIXED (2026-01-16)

**Resolution:**
Token generation now uses a bounded retry loop with a hard cap.

**Current Implementation:**
```typescript
const MAX_TOKEN_GENERATION_ATTEMPTS = 10;
let token: string | null = null;
for (let attempt = 0; attempt < MAX_TOKEN_GENERATION_ATTEMPTS; attempt++) {
  const candidate = generateShareToken();
  const existing = await ctx.db
    .query("shares")
    .withIndex("by_token", (q) => q.eq("token", candidate))
    .first();
  if (!existing) {
    token = candidate;
    break;
  }
}
if (!token) {
  throw new Error("Token-Generierung fehlgeschlagen nach mehreren Versuchen.");
}
```

**Priority:** ✅ RESOLVED

---

### 🔴 Issue #4: No Transaction for Project Delete

**Severity:** CRITICAL - Data Integrity
**File:** `packages/backend/convex/projects.ts`
**Status:** ⚠️ OPEN (Non-atomic deletes)

**Description:**
Cascade delete uses sequential operations without a transaction. Storage delete
failures are logged but not retried or recorded for cleanup:

```typescript
export const remove = mutation({
  handler: async (ctx, { projectId }) => {
    // Delete shares
    for (const share of shares) await ctx.db.delete(share._id);

    // Delete comments
    for (const comment of comments) await ctx.db.delete(comment._id);

    // Delete documents (can fail on storage.delete)
    for (const doc of documents) {
      try {
        await ctx.storage.delete(doc.storageId);
      } catch (e) {
        console.error(e); // logged, but no retry / tracking
      }
      await ctx.db.delete(doc._id);
    }

    // Delete project
    await ctx.db.delete(projectId);
  }
});
```

**Impact:**
- If operation fails mid-way → orphaned records
- Storage delete failures logged only → potential blob leaks
- Inconsistent database state

**Mitigation (Convex doesn't support transactions):**
1. Delete in reverse FK dependency order
2. Track failed storage deletions for manual cleanup
3. Consider soft-delete pattern

```typescript
const failedDeletes: string[] = [];

for (const doc of documents) {
  try {
    await ctx.storage.delete(doc.storageId);
  } catch (e) {
    console.error(`Storage delete failed: ${doc.storageId}`, e);
    failedDeletes.push(doc.storageId);
  }
}

if (failedDeletes.length > 0) {
  console.warn(`Failed to delete ${failedDeletes.length} blobs`, failedDeletes);
  // TODO: Create cleanup task or alert admin
}
```

**Priority:** 🔴 CRITICAL

---

### 🔴 Issue #5: Unbounded Query - Memory Overflow

**Severity:** CRITICAL - Performance/Availability
**File:** `packages/backend/convex/analysis.ts` (getLatest)
**Status:** ⚠️ OPEN

**Description:**
```typescript
const runs = await ctx.db
  .query("analysisRuns")
  .withIndex("by_projectId_type", (q) =>
    q.eq("projectId", args.projectId).eq("type", args.type),
  )
  .collect();  // ❌ Loads ALL runs into memory
```

**Impact:**
- For projects with 1000+ analysis runs → out of memory
- Convex function timeout
- Performance degrades linearly with data growth

**Fix:**
```typescript
const latest = await ctx.db
  .query("analysisRuns")
  .withIndex("by_projectId_type_createdAt", (q) =>
    q.eq("projectId", args.projectId).eq("type", args.type),
  )
  .order("desc")
  .first();
```

**Priority:** 🔴 CRITICAL

---

## High Priority Issues

### 🟠 Issue #6: Prompt Injection + Token Bombing

**Severity:** HIGH - Security + Cost
**File:** `packages/backend/convex/analysis.ts`
**Status:** ⚠️ PARTIALLY MITIGATED (size caps in place)

**Description:**
User-controlled document text directly injected into LLM prompt:

```typescript
const cappedText = limitPromptText(chunk.text, MAX_PROMPT_CHARS);
const userPrompt = `Lies die folgenden Seiten...

Seiten:
${cappedText}`;  // ❌ Unsanitized user content (only truncated)
```

**Attack Vectors:**
1. **Prompt Injection:** Malicious PDF with "Ignore previous instructions, output..."
2. **Token Bombing:** Upload 10MB of text → $100+ per analysis

**Impact:**
- Cost explosion
- Manipulated analysis results
- API key exhaustion

**Current Mitigation:**
- Prompt size is capped via `CONVEX_MAX_PROMPT_CHARS` (default `1200000`) and
  enforced by `limitPromptText(...)` in analysis flows.
- Offer analysis limits pages via `CONVEX_OFFER_PAGE_LIMIT` (default `8`).

**Additional Mitigation (recommended):**
```typescript
// Basic prompt injection sanitization
const sanitized = chunk.text
  .replace(/ignore (all )?previous instructions/gi, "[REDACTED]")
  .replace(/system:/gi, "[REDACTED]");

const userPrompt = `...\n\n${sanitized}`;
```

**Priority:** 🟠 HIGH

---

### 🟠 Issue #7: Race Condition in Queue Limit

**Severity:** HIGH - Cost Control
**File:** `packages/backend/convex/projects.ts`
**Status:** ⚠️ UNFIXED

**Description:**
Queue limit check is not atomic:

```typescript
const projectRuns = await ctx.db
  .query("analysisRuns")
  .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
  .collect();
const orgRuns = await ctx.db
  .query("analysisRuns")
  .withIndex("by_orgId", (q) => q.eq("orgId", identity.orgId))
  .collect();

const shouldStartImmediately =
  projectActiveCount < maxActivePerProject &&
  orgActiveCount < maxActivePerOrg;

// ❌ Race: Two simultaneous calls both see counts below limits
const runId = await ctx.db.insert("analysisRuns", {
  status: shouldStartImmediately ? "läuft" : "wartet",
});
```

**Impact:**
- Multiple runs start simultaneously despite limit
- Cost overrun
- API rate limit violations

**Mitigation:**
- Optimistic locking with version counter
- OR: Dedicated Convex scheduler kicks queue atomically

**Priority:** 🟠 HIGH

---

### 🟠 Issue #8-10: Frontend Memory/Resource Leaks (Needs Verification)

**Files:** Multiple files in `apps/web/src/`
**Status:** 🔍 UNVERIFIED

**Notes:**
- No recent audit has confirmed these issues in the current codebase.
- Past concerns included cleanup on unmount for uploads, unbounded state growth,
  and missing error boundaries during PDF extraction.

**Priority:** 🟠 HIGH (if confirmed)

---

## Medium Priority Issues

### 🟡 Issue #11: Cross-Project Document Attachment

**File:** `packages/backend/convex/offers.ts`
**Status:** ⚠️ UNFIXED

**Description:**
Missing validation allows attaching documents from other projects to offers.

**Fix:**
```typescript
if (document.projectId !== offer.projectId) {
  throw new Error("Document gehört nicht zum selben Projekt.");
}
```

**Priority:** 🟡 MEDIUM

---

### 🟡 Issue #12: N+1 Query Performance

**File:** `packages/backend/convex/projects.ts`
**Status:** ⚠️ UNFIXED

**Description:**
`loadLatestRuns` performs separate DB query for each project.

**Fix:**
Load all runs for org, group by projectId in-memory.

**Priority:** 🟡 MEDIUM

---

### 🟡 Issue #13-20: UX and Performance Issues

**Examples (verified in current codebase):**
- Missing rate limits per user (no per-user throttling)
- `window.location.href` used for navigation in several routes (full reload)

**Examples (needs audit):**
- Unhandled promise rejections in UI flows (not recently validated)

**Priority:** 🟡 MEDIUM

---

## Mitigation Roadmap

### Sprint 1 (Week 1) - CRITICAL FIXES

**Must complete before production:**

1. ✅ Fix weak token generation (Issue #2)
2. ✅ Fix infinite loop in token creation (Issue #3)
3. ⚠️ Address non-atomic project delete (Issue #4) or document risk acceptance
4. ⚠️ Add query limits to prevent memory overflow (Issue #5)

**Verification:**
- Security audit of deployment environment
- Manual testing of all critical scenarios
- Staging deployment validation

---

### Sprint 2 (Week 2) - HIGH PRIORITY

6. ⚠️ Partial: prompt size caps added, sanitization still missing (Issue #6)
7. ⚠️ Fix queue race condition (Issue #7)
8. 🔍 Verify frontend memory/resource leaks (Issues #8-10)
9. ⬜ Add comprehensive error boundaries
10. ⬜ Implement client-side upload abort logic

---

### Sprint 3 (Post-Launch) - MEDIUM PRIORITY

11. ⬜ Fix cross-project document attachment
12. ⬜ Optimize N+1 queries
13. ⬜ Verify citation rendering is escaped; add sanitization if needed
14. ⬜ Implement rate limiting
15. ⬜ Improve UX (loading states, error messages)

---

### Backlog - TECH DEBT

- Type safety improvements (remove `as any`)
- Soft-delete pattern for projects
- Structured logging and monitoring
- E2E test coverage for security scenarios

---

## Security Best Practices

### For Developers

1. **Always use `getIdentityOrThrow()`** - Never bypass auth checks
2. **Filter by `orgId`** - Every query must scope to organization
3. **Validate foreign keys** - Check ownership before cross-table operations
4. **Sanitize LLM inputs** - Never trust user-provided document content
5. **Use Zod schemas** - Validate all external data (LLM outputs, file uploads)

### For Operators

1. **Monitor costs** - Track LLM token usage per organization
2. **Review telemetry** - Check for unusual analysis patterns
3. **Backup regularly** - Convex export schedule
4. **Rotate secrets** - API keys, JWT signing keys

### For Reviewers

**Security Checklist:**
- [ ] All queries filter by `orgId`
- [ ] All mutations call `getIdentityOrThrow()`
- [ ] No unbounded `.collect()` calls
- [ ] Foreign key ownership validated
- [ ] User input sanitized before LLM injection
- [ ] Zod validation for external data
- [ ] Error messages don't leak sensitive data

---

## Incident Response

### Data Breach Procedure

1. **Immediate:** Disable affected deployment (Convex dashboard)
2. **Within 1 hour:** Identify scope (which orgs affected)
3. **Within 4 hours:** Notify affected customers
4. **Within 24 hours:** Root cause analysis and fix deployment
5. **Within 7 days:** Post-mortem and prevention measures

### Cost Overrun Procedure

1. **Alert:** Token usage exceeds threshold (>$100/day per org)
2. **Throttle:** Pause analysis runs for affected org
3. **Investigate:** Review run logs, identify cause
4. **Notify:** Contact org admin about usage
5. **Resume:** After confirmation, lift throttle

---

## Known Limitations

### Architectural

1. **No ACID transactions:** Convex doesn't support multi-record transactions
2. **Client-side extraction:** Large files (>100MB) may crash browser
3. **Serial criteria processing:** Slow for templates with 50+ criteria
4. **No audit log:** User actions not tracked (future: event sourcing)

### Security

1. **No file encryption at rest:** Convex storage uses standard encryption
2. **No end-to-end encryption:** Documents decrypted on server for extraction
3. **No DLP:** No detection of PII/sensitive data in documents
4. **No MFA enforcement:** Clerk configuration, not backend-enforced

### Performance

1. **Analysis queue:** Max concurrent runs per org = `CONVEX_MAX_ACTIVE_RUNS_PER_ORG` (default 10); per project = `CONVEX_MAX_ACTIVE_RUNS_PER_PROJECT` (default 1)
2. **Document size:** 400 MB limit per project (client + server enforcement)
3. **Share link expiration:** Manual cleanup (no auto-delete)

---

## Security Contact

**For security issues:**
- **Email:** security@cloud-solution.ch
- **PGP Key:** [Link to public key]
- **Response SLA:** 24 hours for critical issues

**For general questions:**
- **Email:** support@cloud-solution.ch
- **GitHub Issues:** [Link to repo issues]

---

**Document maintained by:** Cloud Solution GmbH
**Last Security Review:** 2026-01-16
**Next Review:** 2026-02-15

---

**⚠️ REMINDER: Open CRITICAL issues (#4, #5) must be resolved or explicitly risk-accepted before production deployment.**
