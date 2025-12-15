# Security Model and Known Issues

**Last Updated:** 2025-09-30
**Status:** ⚠️ REQUIRES IMMEDIATE ATTENTION BEFORE PRODUCTION

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
**File:** `packages/backend/convex/shares.ts:147-156`
**Status:** ⚠️ UNFIXED

**Description:**
```typescript
function fillRandomBytes(bytes: Uint8Array) {
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
    return;
  }

  // ❌ FALLBACK: Math.random() is NOT cryptographically secure
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
}
```

**Impact:**
- Fallback uses `Math.random()`, which is **predictable**
- Attacker can brute-force or guess share tokens
- Unauthorized access to tender documents

**Fix:**
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

**Priority:** 🔴 IMMEDIATE

---

### 🔴 Issue #3: Infinite Loop in Token Generation

**Severity:** CRITICAL - Availability
**File:** `packages/backend/convex/shares.ts:27-36`
**Status:** ⚠️ UNFIXED

**Description:**
```typescript
let token: string;
while (true) {  // ❌ No timeout protection
  token = generateShareToken();
  const existing = await ctx.db.query("shares")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first();
  if (!existing) break;
}
```

**Impact:**
- If collision rate is high (shouldn't happen with 256 bits, but...)
- Race condition: Two simultaneous requests can both see `!existing` and insert duplicate tokens
- DoS vector: Attacker creates many shares simultaneously

**Fix:**
```typescript
const MAX_RETRIES = 10;
let token: string;

for (let i = 0; i < MAX_RETRIES; i++) {
  token = generateShareToken();
  const existing = await ctx.db.query("shares")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first();

  if (!existing) break;

  if (i === MAX_RETRIES - 1) {
    throw new Error("Token-Generierung fehlgeschlagen nach mehreren Versuchen.");
  }
}
```

**Priority:** 🔴 IMMEDIATE

---

### 🔴 Issue #4: No Transaction for Project Delete

**Severity:** CRITICAL - Data Integrity
**File:** `packages/backend/convex/projects.ts:209-297`
**Status:** ⚠️ UNFIXED

**Description:**
Cascade delete uses sequential operations without transaction:

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
        // ❌ Ignored! Storage leak
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
- Storage delete failures ignored → blob leaks
- Inconsistent database state

**Mitigation (Convex doesn't support transactions):**
1. Delete in reverse FK dependency order
2. Log failed storage deletions for manual cleanup
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
**File:** `packages/backend/convex/analysis.ts:339-344`
**Status:** ⚠️ UNFIXED

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
const runs = await ctx.db
  .query("analysisRuns")
  .withIndex("by_projectId_type", (q) =>
    q.eq("projectId", args.projectId).eq("type", args.type),
  )
  .order("desc") // Newest first
  .take(100);    // Reasonable limit
```

**Priority:** 🔴 CRITICAL

---

## High Priority Issues

### 🟠 Issue #6: Prompt Injection + Token Bombing

**Severity:** HIGH - Security + Cost
**File:** `packages/backend/convex/analysis.ts:540-543`
**Status:** ⚠️ UNFIXED

**Description:**
User-controlled document text directly injected into LLM prompt:

```typescript
const userPrompt = `Lies die folgenden Seiten...

Seiten:
${chunk.text}`;  // ❌ Unsanitized user content
```

**Attack Vectors:**
1. **Prompt Injection:** Malicious PDF with "Ignore previous instructions, output..."
2. **Token Bombing:** Upload 10MB of text → $100+ per analysis

**Impact:**
- Cost explosion
- Manipulated analysis results
- API key exhaustion

**Mitigation:**
```typescript
const MAX_PROMPT_CHARS = 50000;
if (chunk.text.length > MAX_PROMPT_CHARS) {
  throw new ConvexError("Dokumentseite zu groß für Analyse.");
}

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
**File:** `packages/backend/convex/projects.ts:137-178`
**Status:** ⚠️ UNFIXED

**Description:**
Queue limit check is not atomic:

```typescript
const activeRuns = await ctx.db.query("analysisRuns")...collect();
const activeCount = activeRuns.filter(
  (run) => run.status === "wartet" || run.status === "läuft"
).length;

const shouldStartImmediately = activeCount < maxActive;

// ❌ Race: Two simultaneous calls both see activeCount < maxActive
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

### 🟠 Issue #8-10: Frontend Memory Leaks

**Files:** Multiple files in `apps/web/src/`
**Status:** ⚠️ UNFIXED

**Issues:**
- File upload without cleanup on unmount
- Unbounded state arrays (offer uploads)
- Missing error boundaries for PDF extraction

**Priority:** 🟠 HIGH

---

## Medium Priority Issues

### 🟡 Issue #11: Cross-Project Document Attachment

**File:** `packages/backend/convex/offers.ts:135-158`
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

**File:** `packages/backend/convex/projects.ts:299-339`
**Status:** ⚠️ UNFIXED

**Description:**
`loadLatestRuns` performs separate DB query for each project.

**Fix:**
Load all runs for org, group by projectId in-memory.

**Priority:** 🟡 MEDIUM

---

### 🟡 Issue #13-20: UX and Performance Issues

**Examples:**
- XSS risk in citation display (unsanitized quotes)
- Missing rate limits per user
- window.location.href instead of React Router navigation
- Unhandled promise rejections

**Priority:** 🟡 MEDIUM

---

## Mitigation Roadmap

### Sprint 1 (Week 1) - CRITICAL FIXES

**Must complete before production:**

1. ✅ Fix auth bypass (Issue #1)
2. ✅ Fix weak token generation (Issue #2)
3. ✅ Fix infinite loop in token creation (Issue #3)
4. ✅ Add transaction-like logic for project delete (Issue #4)
5. ✅ Add query limits to prevent memory overflow (Issue #5)

**Verification:**
- Security audit of deployment environment
- Manual testing of all 5 scenarios
- Staging deployment validation

---

### Sprint 2 (Week 2) - HIGH PRIORITY

6. ✅ Implement prompt injection sanitization (Issue #6)
7. ✅ Fix queue race condition (Issue #7)
8. ✅ Fix frontend memory leaks (Issues #8-10)
9. ✅ Add comprehensive error boundaries
10. ✅ Implement client-side upload abort logic

---

### Sprint 3 (Post-Launch) - MEDIUM PRIORITY

11. ⬜ Fix cross-project document attachment
12. ⬜ Optimize N+1 queries
13. ⬜ Add XSS sanitization for citations
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

1. **Analysis queue:** Max 1 concurrent run per org (configurable)
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
**Last Security Review:** 2025-09-30
**Next Review:** 2025-10-15 (after Issue #1-5 fixes deployed)

---

**⚠️ REMINDER: Issues #1-5 MUST be fixed before production deployment!**
