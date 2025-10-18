# Known Risks & Follow-ups

**Last reviewed:** 2025-10-01

We previously tracked critical findings in this file; several sections have since become stale. To avoid distributing outdated information, the issue log now lives exclusively in GitHub (private project board + issue tracker).

## Current Summary

| Area | Status | Notes |
|------|--------|-------|
| Data integrity on project deletion | ⚠️ Needs follow-up | `packages/backend/convex/projects.ts` still deletes related records sequentially; wrap in a compensating workflow before launch.
| Analysis run query limits | ⚠️ Needs follow-up | Audit the remaining `.collect()` calls in `analysis.ts`; ensure large orgs cannot exhaust memory.
| Offer check cost controls | ✅ Addressed | Per-criterion jobs enforce retries, backoff, and keyword-based page selection (commit bd62d54).
| Auth bypass for shares | ✅ Addressed | Share tokens now always verify `orgId` and expiry before returning data.

If you discover new risks or close one of the items above, log the outcome directly in GitHub so the history stays canonical.

For urgent production concerns, contact @cloudsolution/security.
