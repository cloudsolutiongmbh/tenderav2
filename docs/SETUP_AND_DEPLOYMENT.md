# Setup and Deployment Guide

**Last Updated:** 2025-09-30
**Target Audience:** Developers, DevOps Engineers, External Reviewers

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Configuration](#configuration)
4. [Development Workflow](#development-workflow)
5. [Testing](#testing)
6. [Production Deployment](#production-deployment)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

| Software | Minimum Version | Purpose |
|----------|----------------|---------|
| **Node.js** | 20.x | JavaScript runtime |
| **npm** | 10.x | Package manager |
| **Git** | 2.x | Version control |

### Required Accounts

1. **Clerk** ([clerk.com](https://clerk.com))
   - Sign up for free account
   - Create a new application
   - Purpose: Authentication and organization management

2. **Convex** ([convex.dev](https://convex.dev))
   - Sign up for free account
   - Purpose: Backend-as-a-service (database, storage, functions)

3. **OpenAI** or **Anthropic**
   - OpenAI: [platform.openai.com](https://platform.openai.com)
   - Anthropic: [console.anthropic.com](https://console.anthropic.com)
   - Purpose: LLM API for document analysis

### System Requirements

- **OS:** macOS, Linux, or Windows (WSL recommended)
- **RAM:** 8 GB minimum (16 GB recommended for large document processing)
- **Disk:** 10 GB free space
- **Network:** Stable internet connection for API calls

---

## Local Development Setup

### 1. Clone Repository

```bash
git clone https://github.com/cloudsolutiongmbh/tenderav2.git
cd tenderav2
```

### 2. Install Dependencies

```bash
npm install
```

This will install dependencies for all workspaces (root, web, backend).

**Expected output:**
```
added 1234 packages in 45s
```

### 3. Set Up Clerk

#### 3.1 Create Clerk Application

1. Go to [dashboard.clerk.com](https://dashboard.clerk.com/)
2. Click **"Create Application"**
3. Name: `Tendera Dev` (or your preferred name)
4. Enable **Organizations** feature

#### 3.2 Create Convex JWT Template

1. In Clerk dashboard, go to **Configure > JWT Templates**
2. Click **"New Template"**
3. Name: `convex`
4. Add custom claim:
   ```json
   {
     "org_id": "{{org.id}}"
   }
   ```
5. Save template

#### 3.3 Copy Clerk Credentials

1. Go to **Configure > API Keys**
2. Copy **Publishable Key** (starts with `pk_test_...`)
3. Copy **JWT Issuer Domain** (e.g., `your-app.clerk.accounts.dev`)

### 4. Set Up Convex

#### 4.1 Login to Convex

```bash
cd packages/backend
npx convex dev
```

**First-time setup:**
- Browser opens for authentication
- Login with GitHub/Google
- Select or create a project
- Convex generates `packages/backend/.env.local`

#### 4.2 Verify Convex Setup

```bash
cat packages/backend/.env.local
```

**Expected output:**
```bash
CONVEX_DEPLOYMENT=dev:your-deployment-name-123456
CONVEX_URL=https://your-deployment.convex.cloud
```

### 5. Configure Environment Variables

#### 5.1 Web App Configuration

Create `apps/web/.env`:

```bash
cd ../../apps/web
cp .env.example .env
```

Edit `apps/web/.env`:
```env
# Convex (copy from packages/backend/.env.local)
VITE_CONVEX_URL=https://your-deployment.convex.cloud

# Clerk (from Clerk dashboard)
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...

# Upload limit (default: 200 MB)
VITE_MAX_UPLOAD_MB=200
```

#### 5.2 Backend Configuration

Edit `packages/backend/.env.local`:

```bash
cd ../../packages/backend
nano .env.local
```

Add the following (keep existing Convex config):

```env
# === Existing Convex Config (DO NOT REMOVE) ===
CONVEX_DEPLOYMENT=dev:your-deployment-name-123456
CONVEX_URL=https://your-deployment.convex.cloud

# === Add these lines ===

# Clerk JWT
CLERK_JWT_ISSUER_DOMAIN=your-app.clerk.accounts.dev

# LLM Provider (choose one)
LLM_PROVIDER=OPENAI              # or ANTHROPIC
LLM_MODEL=gpt-4o-mini            # or claude-3-5-sonnet-20241022

# OpenAI (if LLM_PROVIDER=OPENAI)
OPENAI_API_KEY=sk-...

# Anthropic (if LLM_PROVIDER=ANTHROPIC)
# ANTHROPIC_API_KEY=sk-ant-...

# Analysis Configuration
CONVEX_MAX_ACTIVE_RUNS_PER_ORG=1
CONVEX_ANALYSIS_PAGES_PER_CHUNK=10
MAX_UPLOAD_MB=200
```

### 6. Start Development Servers

Open two terminal windows:

**Terminal 1 - Convex Backend:**
```bash
cd packages/backend
npm run dev
```

**Expected output:**
```
✓ Convex functions ready at https://your-deployment.convex.cloud
✓ Watching for changes...
```

**Terminal 2 - Web App:**
```bash
cd apps/web
npm run dev
```

**Expected output:**
```
VITE v5.x.x  ready in 1234 ms

➜  Local:   http://localhost:3001/
➜  Network: use --host to expose
```

### 7. Verify Setup

1. Open browser to [http://localhost:3001](http://localhost:3001)
2. Click **"Sign In"** (Clerk auth modal should open)
3. Sign up with email or social login
4. After login, you should see the Tendera dashboard

**Troubleshooting:** See [Troubleshooting](#troubleshooting) section below.

---

## Configuration

### Environment Variables Reference

#### Web App (`apps/web/.env`)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `VITE_CONVEX_URL` | ✅ | Convex deployment URL | `https://abc123.convex.cloud` |
| `VITE_CLERK_PUBLISHABLE_KEY` | ✅ | Clerk public key | `pk_test_...` |
| `VITE_MAX_UPLOAD_MB` | ❌ | Max total upload size | `200` (default) |

#### Backend (`packages/backend/.env.local`)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `CONVEX_DEPLOYMENT` | ✅ | Convex deployment ID | `dev:abc123` |
| `CONVEX_URL` | ✅ | Convex API URL | `https://abc123.convex.cloud` |
| `CLERK_JWT_ISSUER_DOMAIN` | ✅ | Clerk JWT issuer | `your-app.clerk.accounts.dev` |
| `LLM_PROVIDER` | ✅ | LLM provider | `OPENAI` or `ANTHROPIC` |
| `LLM_MODEL` | ✅ | Model name | `gpt-4o-mini` |
| `OPENAI_API_KEY` | ⚠️ | OpenAI API key | `sk-...` (if provider=OPENAI) |
| `ANTHROPIC_API_KEY` | ⚠️ | Anthropic API key | `sk-ant-...` (if provider=ANTHROPIC) |
| `CONVEX_MAX_ACTIVE_RUNS_PER_ORG` | ❌ | Queue limit | `1` (default) |
| `CONVEX_ANALYSIS_PAGES_PER_CHUNK` | ❌ | Pages per LLM call | `10` (default) |
| `MAX_UPLOAD_MB` | ❌ | Server-side upload limit | `200` (default) |

### Model Selection Guide

| Model | Cost | Speed | Accuracy | Recommended For |
|-------|------|-------|----------|-----------------|
| `gpt-4o-mini` | $ | Fast | Good | Development, cost-sensitive production |
| `gpt-4o` | $$$ | Medium | Excellent | Production (high accuracy) |
| `claude-3-5-sonnet-20241022` | $$$$ | Slow | Excellent | Complex criteria evaluation |

**Cost Comparison (per analysis):**
- 50-page PDF with `gpt-4o-mini`: ~$0.05-0.10
- 50-page PDF with `gpt-4o`: ~$0.50-1.00
- 50-page PDF with Claude 3.5 Sonnet: ~$2.00-3.00

---

## Development Workflow

### Code Structure

```
tenderav2/
├── apps/
│   └── web/                    # React frontend
│       ├── src/
│       │   ├── routes/        # TanStack Router routes
│       │   ├── components/    # React components
│       │   ├── lib/           # Utilities (PDF extraction)
│       │   └── hooks/         # Custom hooks
│       └── vite.config.ts
├── packages/
│   └── backend/               # Convex backend
│       └── convex/
│           ├── schema.ts      # Database schema
│           ├── *.ts           # Queries, mutations, actions
│           └── _generated/    # Auto-generated types
├── package.json               # Root package (workspace)
└── turbo.json                 # Turborepo config
```

### Common Commands

**Development:**
```bash
# Start all services (web + backend)
npm run dev

# Start web only
npm run dev:web

# Start backend only
npm run dev:server
```

**Type Checking:**
```bash
# Check types across all workspaces
npm run check-types
```

**Build:**
```bash
# Build all packages
npm run build
```

**Convex CLI:**
```bash
# Open Convex dashboard
npx convex dashboard

# Deploy backend to production
npx convex deploy --prod

# View logs
npx convex logs

# Run data migration
npx convex run --prod myMigration
```

### Hot Reload

- **Frontend:** Vite hot module replacement (instant updates)
- **Backend:** Convex auto-deploys on file save (~2 seconds)

### Database Inspection

**Convex Dashboard:**
1. Run `npx convex dashboard`
2. Browser opens to Convex console
3. Tabs:
   - **Data:** Browse tables and records
   - **Functions:** View deployed functions
   - **Logs:** Real-time function logs
   - **Files:** Inspect uploaded documents

**Query Example:**
```typescript
// In Convex dashboard > Data > projects
// Click "Query" and run:
db.query("projects").collect()
```

---

## Testing

### Unit Tests

**Framework:** Vitest

```bash
npm run test:unit
```

**Test Files:**
- Schema validation: `packages/backend/convex/*.test.ts` (planned)

### E2E Tests

**Framework:** Playwright

#### Setup

```bash
# Install Playwright browsers (first time only)
npx playwright install
```

#### Running Tests

**1. Start E2E Stack:**
```bash
# Terminal 1
npm run dev:e2e
```

This starts:
- Convex backend with test mode (`CONVEX_TEST_MODE=1`)
- Web app with mocked auth (`VITE_E2E_MOCK=1`)

**2. Run Tests:**
```bash
# Terminal 2
npm run test:e2e
```

**Expected output:**
```
Running 5 tests using 1 worker

✓ tests/upload.spec.ts:12:5 › upload multiple files (5s)
✓ tests/analysis.spec.ts:20:5 › standard analysis flow (45s)
✓ tests/criteria.spec.ts:15:5 › criteria evaluation (30s)
✓ tests/export.spec.ts:10:5 › PDF export (10s)
✓ tests/share.spec.ts:8:5 › share link (8s)

5 passed (98s)
```

#### Test Files

```
tests/
├── upload.spec.ts      # Document upload flow
├── analysis.spec.ts    # Standard analysis
├── criteria.spec.ts    # Criteria evaluation
├── export.spec.ts      # PDF export
└── share.spec.ts       # Share link generation
```

### Manual Testing Checklist

- [ ] Sign up / Sign in with Clerk
- [ ] Create organization
- [ ] Create project
- [ ] Upload PDF (multi-page)
- [ ] Upload DOCX
- [ ] Start standard analysis
- [ ] View analysis results with citations
- [ ] Create template with criteria
- [ ] Start criteria analysis
- [ ] View criteria results
- [ ] Generate share link
- [ ] Open share link in incognito (no auth required)
- [ ] Export PDF
- [ ] Add comment
- [ ] Delete project

---

## Production Deployment

### Pre-Deployment Checklist

**Security:**
- [ ] Fix all CRITICAL issues in `SECURITY_AND_ISSUES.md`
- [ ] Verify `CONVEX_TEST_BYPASS_AUTH` is NOT set
- [ ] Rotate API keys from development
- [ ] Enable Clerk production settings
- [ ] Configure CSP headers

**Performance:**
- [ ] Test with 100+ page document
- [ ] Verify backpressure queue works
- [ ] Check LLM token usage tracking

**Monitoring:**
- [ ] Set up error tracking (Sentry)
- [ ] Configure log aggregation
- [ ] Create cost alerts

### Convex Production Deployment

#### 1. Create Production Deployment

```bash
cd packages/backend
npx convex deploy --prod
```

**Output:**
```
✓ Deployed to production: https://your-prod.convex.cloud
✓ Updated .env.local with production URL
```

#### 2. Configure Production Environment

Edit `packages/backend/.env.local`:

```env
# Convex (auto-updated by deploy command)
CONVEX_DEPLOYMENT=prod:your-prod-deployment
CONVEX_URL=https://your-prod.convex.cloud

# Clerk
CLERK_JWT_ISSUER_DOMAIN=your-prod-app.clerk.accounts.dev

# LLM
LLM_PROVIDER=OPENAI
LLM_MODEL=gpt-4o-mini
OPENAI_API_KEY=sk-prod-...

# ⚠️ CRITICAL: Ensure this is NOT set!
# CONVEX_TEST_BYPASS_AUTH=1

# Production tuning
CONVEX_MAX_ACTIVE_RUNS_PER_ORG=2
CONVEX_ANALYSIS_PAGES_PER_CHUNK=10
MAX_UPLOAD_MB=200
```

### Frontend Production Deployment (Vercel)

#### 1. Create Vercel Project

```bash
npm install -g vercel
cd apps/web
vercel login
vercel
```

**Follow prompts:**
- Link to existing project? `No`
- Project name: `tendera`
- Directory: `./` (already in apps/web)
- Override settings? `No`

#### 2. Configure Environment Variables

In Vercel dashboard:
1. Go to **Settings** > **Environment Variables**
2. Add:
   ```
   VITE_CONVEX_URL=https://your-prod.convex.cloud
   VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
   VITE_MAX_UPLOAD_MB=200
   ```

#### 3. Configure Build Settings

**Framework Preset:** Vite
**Build Command:** `npm run build`
**Output Directory:** `dist`
**Install Command:** `npm install`

#### 4. Deploy

```bash
vercel --prod
```

**Output:**
```
✓ Production: https://tendera.vercel.app [copied to clipboard]
```

### Post-Deployment Verification

**Smoke Tests:**
1. Visit production URL
2. Sign in with production Clerk account
3. Create test project
4. Upload small PDF (2-3 pages)
5. Run standard analysis
6. Verify results appear
7. Generate share link
8. Test share link in incognito
9. Delete test project

**Monitoring:**
- Check Convex logs: `npx convex logs --prod`
- Monitor LLM token usage
- Set up alerts for errors

---

## Troubleshooting

### Issue: "Nicht authentifiziert" Error

**Symptoms:** All API calls return authentication error.

**Causes:**
1. Clerk JWT template missing `org_id` claim
2. Clerk publishable key mismatch
3. User not in an organization

**Solution:**
```bash
# 1. Verify Clerk JWT template
#    Go to Clerk dashboard > JWT Templates > convex
#    Ensure custom claim: { "org_id": "{{org.id}}" }

# 2. Verify environment variable
echo $VITE_CLERK_PUBLISHABLE_KEY
# Should match Clerk dashboard API Keys

# 3. Create organization
#    In app, click user menu > "Create Organization"
```

---

### Issue: "Keine Dokumentseiten zum Analysieren gefunden"

**Symptoms:** Cannot start analysis after uploading files.

**Causes:**
1. Client-side extraction failed
2. `textExtracted = false` on document

**Solution:**
```bash
# 1. Check browser console for errors
#    Look for PDF.js or mammoth errors

# 2. Verify document in Convex dashboard
npx convex dashboard
# Go to Data > documents
# Check: textExtracted = true, pageCount > 0

# 3. Re-upload file
#    Delete document and re-upload
```

---

### Issue: Analysis Stuck in "läuft" Status

**Symptoms:** Analysis run never completes.

**Causes:**
1. LLM API error (rate limit, invalid key)
2. Convex action timeout
3. Invalid JSON response from LLM

**Solution:**
```bash
# 1. Check Convex logs
npx convex logs
# Look for error messages in analysis.runStandard

# 2. Verify LLM API key
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
# Should return list of models

# 3. Check analysisRuns table
# In Convex dashboard > Data > analysisRuns
# Look for `error` field on stuck run
```

---

### Issue: "Rate limit erreicht" Error

**Symptoms:** Analysis fails with rate limit error.

**Causes:**
1. Too many concurrent requests
2. LLM provider tier limits

**Solution:**
```bash
# 1. Increase backpressure limit (if needed)
# Edit packages/backend/.env.local
CONVEX_MAX_ACTIVE_RUNS_PER_ORG=1

# 2. Wait and retry
#    OpenAI rate limits reset per minute

# 3. Upgrade LLM provider tier
#    Visit provider dashboard to increase limits
```

---

### Issue: Large Document Upload Fails

**Symptoms:** Browser crashes or upload never completes.

**Causes:**
1. Client-side extraction exhausts memory
2. File exceeds MAX_UPLOAD_MB
3. Network timeout

**Solution:**
```bash
# 1. Check file size
ls -lh your-file.pdf
# Should be < 200 MB

# 2. Split large PDFs
#    Use external tool to split into smaller files

# 3. Increase browser memory (Chrome)
chrome --max-old-space-size=8192
```

---

### Issue: Share Link Returns "Ungültiger Link"

**Symptoms:** Share link not found.

**Causes:**
1. Token mismatch (copy-paste error)
2. Share deleted
3. Database query issue

**Solution:**
```bash
# 1. Verify token in URL
#    Token should be 43 characters (base64url)

# 2. Check shares table
# In Convex dashboard > Data > shares
# Search for token

# 3. Re-generate share link
#    Create new share and copy fresh URL
```

---

### Common Development Issues

**Port 3001 already in use:**
```bash
# Kill process on port 3001
lsof -ti:3001 | xargs kill -9

# Or use different port
VITE_PORT=3002 npm run dev:web
```

**npm install fails:**
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

**Convex functions not updating:**
```bash
# Restart Convex dev server
# Ctrl+C in terminal, then:
npm run dev:server
```

**Type errors in IDE:**
```bash
# Regenerate Convex types
cd packages/backend
npx convex dev
# Wait for "✓ Functions ready"
# Types should auto-generate in convex/_generated/
```

---

## Additional Resources

### Documentation

- **Convex Docs:** [docs.convex.dev](https://docs.convex.dev)
- **Clerk Docs:** [clerk.com/docs](https://clerk.com/docs)
- **Vite Docs:** [vitejs.dev](https://vitejs.dev)
- **TanStack Router:** [tanstack.com/router](https://tanstack.com/router)

### Support

- **GitHub Issues:** [github.com/cloudsolutiongmbh/tenderav2/issues](https://github.com/cloudsolutiongmbh/tenderav2/issues)
- **Email:** support@cloud-solution.ch

### Architecture References

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture overview
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Database schema and ERD
- [API_REFERENCE.md](./API_REFERENCE.md) - Backend API documentation
- [LLM_INTEGRATION.md](./LLM_INTEGRATION.md) - LLM prompts and strategies
- [SECURITY_AND_ISSUES.md](./SECURITY_AND_ISSUES.md) - Security model and known issues

---

**Setup Guide maintained by:** Cloud Solution GmbH
**Last Updated:** 2025-09-30
**Tested on:** macOS 14.x, Ubuntu 22.04, Windows 11 (WSL)
