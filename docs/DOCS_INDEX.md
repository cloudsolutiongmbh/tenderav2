# Documentation Index

**Tendera - AI-Powered Tender Analysis Platform**
**Last Updated:** 2025-10-01

---

## 📚 Documentation Overview

This index provides quick access to all documentation for the Tendera codebase. Documents are organized by audience and purpose.

---

## 🎯 Quick Start Guides

**For New Developers:**
1. Start with [README.md](../README.md) - Project overview and quick start
2. Follow [SETUP_AND_DEPLOYMENT.md](./SETUP_AND_DEPLOYMENT.md) - Local development setup
3. Review [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture

**For External Code Reviewers:**
1. Read [ARCHITECTURE.md](./ARCHITECTURE.md) - System design and components
2. Review [SECURITY_AND_ISSUES.md](./SECURITY_AND_ISSUES.md) - open security issues and mitigations
3. Examine [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Data model
4. Check [API_REFERENCE.md](./API_REFERENCE.md) - Backend API documentation

**For Product/Project Managers:**
1. [README.md](../README.md) - What is Tendera?
2. [SETUP_AND_DEPLOYMENT.md](./SETUP_AND_DEPLOYMENT.md) - Operational procedures
3. [issues.md](../issues.md) - Current risk register (see note in document)

---

## 📖 Core Documentation

### [README.md](../README.md)
**Audience:** All users
**Purpose:** Project overview, quick start, and feature list

**Contents:**
- What is Tendera?
- Key features
- Tech stack
- Quick start guide
- Usage examples
- Architecture diagram
- Development commands

---

### [ARCHITECTURE.md](./ARCHITECTURE.md)
**Audience:** Developers, Architects, Code Reviewers
**Purpose:** System design and technical architecture

**Contents:**
- System overview and principles
- Component breakdown (frontend + backend)
- Data flow diagrams
- Technology stack details
- Deployment architecture
- Security model
- Performance optimization
- Future enhancements

**Key Sections:**
- **Data Flow:** Document upload, analysis, and share flows
- **Backpressure Management:** Queue system for LLM calls
- **Multi-Tenancy:** Organization isolation strategy

---

### [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)
**Audience:** Backend Developers, DBAs, Code Reviewers
**Purpose:** Complete database schema reference

**Contents:**
- Entity Relationship Diagram (ERD)
- Table definitions with field descriptions
- Index strategy and performance guidelines
- Data types and conventions
- Relationships and foreign keys
- Query examples
- Security considerations

**Key Tables:**
- `projects` - Main project entity
- `documents` / `docPages` - Document storage
- `templates` - Criteria templates
- `analysisRuns` / `analysisResults` - Analysis tracking
- `offers` / `offerCriteriaResults` - Offer comparison

---

### [API_REFERENCE.md](./API_REFERENCE.md)
**Audience:** Frontend Developers, API Consumers, Code Reviewers
**Purpose:** Complete backend API documentation

**Contents:**
- Authentication patterns
- Projects API (CRUD)
- Documents API (upload, attach, delete)
- Templates API (manage criteria)
- Analysis API (run, get results)
- Shares API (create, resolve)
- Comments API
- Offers API (Offerten-Vergleich)
- Error handling patterns
- Telemetry tracking

**Key Functions:**
- `projects.startStandardAnalysis` - Trigger analysis
- `analysis.getLatest` - Live query for results
- `shares.create` / `shares.resolve` - Share link management

---

### [LLM_INTEGRATION.md](./LLM_INTEGRATION.md)
**Audience:** AI/ML Engineers, Prompt Engineers, Code Reviewers
**Purpose:** LLM integration strategy and prompt engineering

**Contents:**
- Provider configuration (OpenAI, Anthropic)
- Prompt engineering strategy
- Standard analysis prompts
- Criteria analysis prompts
- Offerten-Vergleich prompts
- Anti-hallucination measures
- JSON parsing and validation
- Telemetry and cost optimization

**Key Topics:**
- **Citation Requirement:** Every fact must include `{documentKey, page, quote}` (with document metadata carried through)
- **Chunking Strategy:** ~15 pages per LLM call (configurable)
- **Temperature Settings:** 0.1-0.3 for deterministic outputs
- **Zod Validation:** Runtime schema validation

---

### [SECURITY_AND_ISSUES.md](./SECURITY_AND_ISSUES.md)
**Audience:** Security Engineers, DevOps, Management, Code Reviewers
**Purpose:** Security model and known vulnerabilities

**⚠️ IMPORTANT: Open CRITICAL issues (#4, #5) must be resolved or risk-accepted before production.**

**Contents:**
- Multi-tenant security model
- Authentication and authorization flow
- **CRITICAL issues (current status):**
  - ✅ Fixed: Weak token generation fallback (Issue #2)
  - ✅ Fixed: Infinite loop in token creation (Issue #3)
  - ⚠️ Open: No transaction for project delete (Issue #4)
  - ⚠️ Open: Unbounded queries causing memory overflow (Issue #5)
- **High priority issues**
- **Medium priority issues**
- Mitigation roadmap
- Security best practices

**Action Items:**
- Review open CRITICAL issues before production
- Track mitigations in the roadmap
- Security audit of deployment environment

---

### [SETUP_AND_DEPLOYMENT.md](./SETUP_AND_DEPLOYMENT.md)
**Audience:** Developers, DevOps, External Reviewers
**Purpose:** Step-by-step setup and deployment instructions

**Contents:**
- Prerequisites (software, accounts)
- Local development setup (7 steps)
- Configuration reference
- Development workflow
- Testing (unit, E2E)
- Production deployment (Convex + Vercel)
- Troubleshooting guide

**Quick Start Commands:**
```bash
npm install
npm run dev:server    # Terminal 1
npm run dev:web       # Terminal 2
```

---

## 📋 Planning and Project Management

Roadmap tracking has moved to the internal GitHub Projects board. Historical planning documents have been removed from the repository to avoid drifting information. For current priorities, contact the product team or consult the private board.

---

### [issues.md](../issues.md)
**Audience:** All team members
**Purpose:** Known issues and bug tracking (living document; priorities change frequently)

**Contents:**
- Prioritized issue list (Critical → Low)
- Issue descriptions with code references
- Impact analysis and recommendations

**Status:** Actively maintained; review file for current counts and priorities.

---

## 📝 Supporting Documents

Historical PRDs were removed to avoid drift. The current source of truth is the codebase and this documentation set; new product requirements are tracked in the private backlog.

---

### [problem.md](../problem.md)
**Audience:** Management, Stakeholders
**Purpose:** Business problem and solution analysis

---

## 🗂️ Code Navigation

### Frontend (apps/web/src/)

**Key Directories:**
```
routes/                    # TanStack Router pages
├── projekte.tsx          # Projects list
├── projekte.$id.*.tsx    # Project detail pages
├── templates.tsx         # Template management
└── share.$token.tsx      # Public share view

components/
├── analysis-cards/       # Summary, milestones, requirements
├── criteria-panel/       # Criteria evaluation UI
├── ui/                   # shadcn/ui components
└── upload-dropzone.tsx   # Multi-file upload

lib/
└── extract-text.ts       # Client-side PDF/DOCX extraction

hooks/
└── useOrgAuth.ts         # Organization auth helpers
```

### Backend (packages/backend/convex/)

**Key Files:**
```
schema.ts                 # Database schema (⭐ START HERE)
auth.ts                   # Auth helpers
projects.ts               # Project CRUD
documents.ts              # File upload
docPages.ts               # Extracted text storage
templates.ts              # Criteria templates
analysis.ts               # LLM orchestration (⭐ COMPLEX)
llm.ts                    # Provider abstraction
shares.ts                 # Share links
comments.ts               # Comments
offers.ts                 # Offer comparison
```

---

## 🔍 Search Guide

**Finding specific information:**

| What you need | Where to look |
|---------------|---------------|
| How to set up locally | [SETUP_AND_DEPLOYMENT.md](./SETUP_AND_DEPLOYMENT.md) |
| Database table schema | [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) |
| API function signature | [API_REFERENCE.md](./API_REFERENCE.md) |
| LLM prompt templates | [LLM_INTEGRATION.md](./LLM_INTEGRATION.md) |
| Security vulnerabilities | [SECURITY_AND_ISSUES.md](./SECURITY_AND_ISSUES.md) |
| System architecture | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Roadmap / planning | Internal GitHub Projects board (ask product team) |
| Known risks & bugs | [issues.md](../issues.md) |

---

## 🚀 Common Workflows

### Adding a New Feature

1. **Plan:** Align with the product roadmap (GitHub Projects board)
2. **Design:** Update [ARCHITECTURE.md](./ARCHITECTURE.md) if architectural changes
3. **Schema:** Update [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) if new tables/fields
4. **API:** Document new endpoints in [API_REFERENCE.md](./API_REFERENCE.md)
5. **Test:** Add E2E tests (see [SETUP_AND_DEPLOYMENT.md](./SETUP_AND_DEPLOYMENT.md))
6. **Deploy:** Follow production deployment guide

### Debugging an Issue

1. **Reproduce:** Follow [SETUP_AND_DEPLOYMENT.md](./SETUP_AND_DEPLOYMENT.md) setup
2. **Check Known Issues:** Review [SECURITY_AND_ISSUES.md](./SECURITY_AND_ISSUES.md) and [issues.md](../issues.md)
3. **Logs:** Check Convex dashboard (see [SETUP_AND_DEPLOYMENT.md](./SETUP_AND_DEPLOYMENT.md) troubleshooting)
4. **Schema:** Verify data model in [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)
5. **API:** Check function implementation via [API_REFERENCE.md](./API_REFERENCE.md)

### Code Review Checklist

- [ ] Read [ARCHITECTURE.md](./ARCHITECTURE.md) to understand system design
- [ ] Review [SECURITY_AND_ISSUES.md](./SECURITY_AND_ISSUES.md) for critical issues
- [ ] Check [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for data model consistency
- [ ] Verify API patterns match [API_REFERENCE.md](./API_REFERENCE.md)
- [ ] Ensure LLM prompts follow [LLM_INTEGRATION.md](./LLM_INTEGRATION.md) guidelines
- [ ] Test locally using [SETUP_AND_DEPLOYMENT.md](./SETUP_AND_DEPLOYMENT.md)

---

## 📊 Documentation Stats

| Document | Approx. Lines | Last Reviewed | Status |
|----------|----------------|---------------|--------|
| README.md | ~550 | 2025-10-01 | ✅ Up to date |
| ARCHITECTURE.md | ~700 | 2025-09-30 | ⚠️ Needs revisit after offer-check changes |
| DATABASE_SCHEMA.md | ~900 | 2025-10-01 | ✅ Up to date |
| API_REFERENCE.md | ~1,100 | 2025-10-01 | ✅ Up to date |
| LLM_INTEGRATION.md | ~900 | 2025-10-01 | ✅ Up to date |
| SECURITY_AND_ISSUES.md | ~700 | 2025-09-30 | ⚠️ Contains open risks |
| SETUP_AND_DEPLOYMENT.md | ~750 | 2025-10-01 | ✅ Up to date |
| issues.md | ~350 | 2025-10-01 | 🚧 Active tracking |

**Total Documentation:** ~5,000 lines covering the maintained corpus

---

## 🤝 Contributing to Documentation

### When to Update Docs

- **New feature:** Update ARCHITECTURE.md, API_REFERENCE.md, and README.md
- **Schema change:** Update DATABASE_SCHEMA.md
- **Bug fix:** Update issues.md and SECURITY_AND_ISSUES.md if security-related
- **Deployment change:** Update SETUP_AND_DEPLOYMENT.md
- **Prompt change:** Update LLM_INTEGRATION.md

### Documentation Standards

1. **Keep it current:** Update docs in the same PR as code changes
2. **Be specific:** Include file paths and line numbers
3. **Use examples:** Show code snippets and commands
4. **Be concise:** But provide complete information
5. **Link liberally:** Reference other docs for details

### Review Checklist

- [ ] Grammar and spelling checked
- [ ] Code examples tested
- [ ] Links verified
- [ ] Last Updated date changed
- [ ] DOCS_INDEX.md updated if new file

---

## 📞 Support

**For questions about documentation:**
- Email: support@cloud-solution.ch
- GitHub Issues: Tag with `documentation` label

**For security issues:**
- Email: security@cloud-solution.ch
- See [SECURITY_AND_ISSUES.md](./SECURITY_AND_ISSUES.md) for contact info

---

**Documentation maintained by:** Cloud Solution GmbH
**Last Updated:** 2025-09-30
**Next Review:** After major feature releases or architectural changes
