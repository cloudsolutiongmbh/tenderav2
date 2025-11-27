# LLM Integration and Prompt Engineering Guide

**Last Updated:** 2025-09-30
**Primary File:** `packages/backend/convex/llm.ts`, `packages/backend/convex/analysis.ts`

---

## Table of Contents

1. [Overview](#overview)
2. [Provider Configuration](#provider-configuration)
3. [Prompt Engineering Strategy](#prompt-engineering-strategy)
4. [Standard Analysis Prompts](#standard-analysis-prompts)
5. [Criteria Analysis Prompts](#criteria-analysis-prompts)
6. [Offerten-Vergleich Prompts](#offerten-vergleich-prompts)
7. [Anti-Hallucination Measures](#anti-hallucination-measures)
8. [JSON Parsing and Validation](#json-parsing-and-validation)
9. [Telemetry and Cost Optimization](#telemetry-and-cost-optimization)

---

## Overview

Tendera uses LLMs for structured information extraction from tender documents. The system is designed for:

- **Accuracy:** Strict citation requirements to prevent hallucinations
- **Cost Efficiency:** Chunking strategies and provider switching
- **Reliability:** Zod validation and automatic retry logic
- **Flexibility:** Provider-agnostic abstraction layer

### Supported Providers

| Provider | Models | Use Case |
|----------|--------|----------|
| **OpenAI** | `gpt-4o`, `gpt-4o-mini` | Cost-effective, fast |
| **Anthropic** | `claude-3-5-sonnet-20241022` | Higher accuracy, better reasoning |

---

## Provider Configuration

### Environment Variables

```bash
# Choose provider
LLM_PROVIDER=OPENAI              # or ANTHROPIC

# Configure model
LLM_MODEL=gpt-4o-mini            # OpenAI
# LLM_MODEL=claude-3-5-sonnet-20241022  # Anthropic

# API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### Provider Abstraction Layer

**File:** `packages/backend/convex/llm.ts`

```typescript
interface LlmCallOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

interface LlmResponse {
  text: string;
  usage: {
    promptTokens?: number;
    completionTokens?: number;
  };
  latencyMs: number;
  provider: string;
  model: string;
}

export async function callLlm(options: LlmCallOptions): Promise<LlmResponse>
```

**Unified Interface:**
- Abstracts provider-specific API differences
- Automatic token counting
- Latency tracking
- Error normalization

**Example:**
```typescript
const response = await callLlm({
  systemPrompt: "Du bist ein Experte für öffentliche Ausschreibungen.",
  userPrompt: "Extrahiere alle Meilensteine aus diesem Dokument:\n\n...",
  temperature: 0.3,
  maxOutputTokens: 1800,
});
```

---

## Prompt Engineering Strategy

### Core Principles

1. **German Language:** All prompts and expected outputs in German
2. **Strict JSON:** Enforce JSON output format (no prose)
3. **Citation Requirement:** Every fact must include `{documentKey, page, quote}` (document metadata preserved end-to-end)
4. **Schema Definition:** Explicit JSON schema in system prompt
5. **Anti-Hallucination:** "Answer only from provided pages" instruction

### Prompt Structure

```
┌────────────────────────────────────────┐
│ System Prompt                          │
├────────────────────────────────────────┤
│ • Role definition                      │
│ • Output format (JSON schema)          │
│ • Strict rules (citations mandatory)   │
│ • Anti-hallucination instructions      │
│ • German language requirement          │
└────────────────────────────────────────┘
                ↓
┌────────────────────────────────────────┐
│ User Prompt                            │
├────────────────────────────────────────┤
│ • Specific task description            │
│ • Document pages (formatted)           │
│ • Expected output reminder             │
└────────────────────────────────────────┘
                ↓
┌────────────────────────────────────────┐
│ LLM Response                           │
├────────────────────────────────────────┤
│ • Structured JSON                      │
│ • Validated with Zod schema            │
└────────────────────────────────────────┘
```

### Temperature Settings

| Analysis Type | Temperature | Rationale |
|--------------|-------------|-----------|
| Standard Analysis | 0.3 | Deterministic extraction |
| Criteria Evaluation | 0.1 | Strict yes/no/partial judgments |
| Pflichtenheft Extraction | 0.1 | Precise criterion identification |

---

## Standard Analysis Prompts

### System Prompt

**File:** `packages/backend/convex/analysis.ts:473-538`

```
Du bist ein deutscher KI-Assistent zur strukturierten Analyse von
HSE-Ausschreibungsunterlagen. Deine einzige Aufgabe ist es, basierend
ausschließlich auf den gelieferten Dokumentseiten genau EIN valides
JSON-Objekt gemäß der beschriebenen Struktur auszugeben.

<code_editing_rules>
<guiding_principles>
- **Exaktheit und Belegbarkeit**: Jede extrahierte Information muss durch
  ein Zitat aus dem Quelldokument belegt werden, sofern eine Quelle existiert.
  Annahmen sind zu vermeiden.
- **Vollständigkeit**: Alle Felder des Ziel-JSON-Schemas müssen ausgefüllt
  werden. Wenn keine Information gefunden wird, ist explizit `null` zu verwenden.
- **Strukturtreue**: Halte dich strikt an das vorgegebene JSON-Format, die
  Feldnamen und die Datentypen. Keine zusätzlichen Felder oder abweichenden
  Strukturen.
- **Präzision**: Fasse Informationen prägnant zusammen, aber bewahre den
  ursprünglichen Sinn und Kontext.
- **Fokus**: Konzentriere dich ausschließlich auf die Extraktion der
  geforderten Informationen. Interpretiere nicht über den Inhalt der
  Dokumente hinaus.
</guiding_principles>
</code_editing_rules>

Vorgaben:
- Antworte **nur auf Deutsch**.
- Gib **exakt ein einziges JSON-Objekt** gemäß der vorgegebenen Struktur aus.
  Kein Array, keine Kommentare, kein Fließtext, keine Erklärungen.
- **Jede inhaltliche Aussage muss ein Zitat enthalten**, sofern eine Quelle
  auf den Seiten existiert.
- Fehlende Werte sind grundsätzlich mit `null` zu füllen, auch bei
  verschachtelten Objekten und für jedes Feld ohne Information.
- Die Seitenzahl im Citation-Objekt muss als Zahl (Numerus) angegeben werden,
  nicht als String.
- Halte dich strikt an die Feldnamen und die Struktur des Schemas; verwende
  keine zusätzlichen Felder oder Strukturen.

## Output Format
{
  "summary": string | null,
  "milestones": [
    {
      "title": string,
      "date": string | null,
      "citation": { "page": number, "quote": string } | null
    }
  ],
  "requirements": [
    {
      "title": string,
      "category": string | null,
      "notes": string | null,
      "citation": { "page": number, "quote": string } | null
    }
  ],
  "metadata": [
    {
      "label": string,
      "value": string,
      "citation": { "page": number, "quote": string } | null
    }
  ]
}
```

### User Prompt Template

```typescript
const userPrompt = `Lies die folgenden Seiten und liefere genau EIN valides
JSON-Objekt (kein Array, keine Erklärungen, keine Kommentare, kein Fließtext).

Seiten:
${chunk.text}`;
```

### Document Chunking

**Default:** 15 pages per chunk (`CONVEX_ANALYSIS_PAGES_PER_CHUNK`)

Chunk text is prefixed with the document key and filename to keep citations source-aware:

```typescript
// Example format inside a chunk
Dokument A (Pflichtenheft.pdf) — Seite 1:
<page text>

Dokument B (Anhang.docx) — Seite 2:
<page text>
```

**Rationale:**
- Reduces context window usage (cost)
- Stays within model token limits
- Enables progressive result display

### Result Merging

After processing all chunks, results are merged:

```typescript
function mergeStandardResults(results: StandardResult[]) {
  const summary = results.map(r => r.summary).join("\n\n");

  const milestones = dedupeByKey(
    results.flatMap(r => r.milestones),
    (item) => `${item.title}-${item.date ?? ""}`,
  );

  const requirements = dedupeByKey(
    results.flatMap(r => r.requirements),
    (item) => `${item.title}-${item.category ?? ""}`,
  );

  const metadata = dedupeByKey(
    results.flatMap(r => r.metadata),
    (item) => item.label,
  );

  return { summary, milestones, requirements, metadata };
}
```

---

## Criteria Analysis Prompts

### System Prompt

**File:** `packages/backend/convex/analysis.ts:575-576`

```
Du bist ein deutschsprachiger Assistent zur Bewertung von Kriterien in
Ausschreibungsunterlagen. Antworte ausschliesslich auf Deutsch und nur
auf Basis der bereitgestellten Textauszüge.
```

### User Prompt Template

```typescript
const userPrompt = `Bewerte das folgende Kriterium anhand der bereitgestellten
Dokumentseiten. Liefere GENAU EIN JSON-OBJEKT (kein Array, keine Erklärungen,
kein Markdown) mit folgender Struktur:

{
  "status": "gefunden" | "nicht_gefunden" | "teilweise",
  "comment": string | null,
  "answer": string | null,
  "score": number | null,
  "citations": [ { "page": number, "quote": string } ]
}

Regeln:
- Gib ausschliesslich dieses JSON-Objekt zurück (kein Array, kein Fliesstext,
  keine Codeblöcke).
- Jede Aussage benötigt mindestens ein Zitat in "citations" (page + quote).
- Fehlende Werte als null eintragen.

Kriterium:
Titel: ${criterion.title}
Beschreibung: ${criterion.description ?? "-"}
Hinweise: ${criterion.hints ?? "-"}
Antworttyp: ${criterion.answerType}
Gewicht: ${criterion.weight}
Pflicht: ${criterion.required ? "ja" : "nein"}
Schlüsselwörter: ${(criterion.keywords ?? []).join(", ") || "-"}

Dokumentseiten:
${documentContext}`;
```

### Document Context Building

```typescript
function buildDocumentContext(pages: Array<{ page: number; text: string }>) {
  return pages
    .map((page) => `Seite ${page.page}:\n${page.text}`)
    .join("\n\n");
}
```

**Note:** Criteria analysis uses **full document context** (not chunked) to ensure cross-page matching.

### Offer Page Prioritisation

For offer checks we build a ranked view of the offer document before calling the LLM:

1. Collect keywords from the criterion title, description, hints, and explicit keyword list.
2. Score each offer page by keyword frequency.
3. Sort by score (desc) and surface the top `CONVEX_OFFER_PAGE_LIMIT` pages first.
4. Append the remaining pages in natural order so the model still receives the complete document.
5. If no page matches the keywords, the full document is forwarded unchanged.

This keeps the most relevant evidence upfront while preserving recall and enabling the model to fall back to the rest of the document if our heuristic misses something.

### Offer Job Concurrency

- Each criterion becomes a job in `offerCriterionJobs`.
- Background workers (`runOfferCriterionWorker`) process jobs in parallel, capped by `CONVEX_MAX_PARALLEL_OFFER_JOBS` (default **3**).
- Jobs implement exponential backoff with a `retryAfter` timestamp and are retried up to `CONVEX_OFFER_JOB_MAX_ATTEMPTS`.
- Stale jobs (`status="processing"` for longer than `CONVEX_OFFER_JOB_TIMEOUT_MS`) are recycled automatically.

---

## Offerten-Vergleich Prompts

### Pflichtenheft Extraction Prompt

**Purpose:** Extract Muss-Kriterien and Kann-Kriterien from tender specifications.

**File:** `packages/backend/convex/analysis.ts:1645-1676`

```
Du bist ein deutscher KI-Assistent zur Analyse von Pflichtenheften. Deine
Aufgabe ist es, aus dem vorliegenden Dokument alle Muss-Kriterien und
Kann-Kriterien zu extrahieren.

Vorgaben:
- Antworte **nur auf Deutsch**.
- Gib **exakt ein einziges JSON-Objekt** gemäß der vorgegebenen Struktur aus.
- Muss-Kriterien sind obligatorisch und müssen erfüllt werden
  (z.B. "muss", "erforderlich", "zwingend").
- Kann-Kriterien sind optional oder wünschenswert
  (z.B. "kann", "sollte", "wünschenswert").
- Extrahiere nur explizit genannte Kriterien aus dem Dokument.
- Gib für jedes Kriterium das Feld "pages" an: eine Liste mit allen
  Seitenzahlen (1-basierte Nummerierung), auf denen das Kriterium im
  Dokument erwähnt wird.

## Output Format
{
  "mussCriteria": [
    {
      "title": string,
      "description": string | null,
      "hints": string | null,
      "pages": number[]
    }
  ],
  "kannCriteria": [
    {
      "title": string,
      "description": string | null,
      "hints": string | null,
      "pages": number[]
    }
  ]
}
```

### Offer Check Prompt

**Purpose:** Evaluate whether a vendor offer fulfills a specific criterion.

**File:** `packages/backend/convex/analysis.ts:1713-1737`

```
Du bist ein deutscher KI-Assistent zur Prüfung von Angeboten gegen definierte
Kriterien. Deine Aufgabe ist es, ein Angebot gegen ein spezifisches Kriterium
zu prüfen und zu bewerten, ob das Kriterium erfüllt ist.

Vorgaben:
- Antworte **nur auf Deutsch**.
- Gib **exakt ein einziges JSON-Objekt** gemäß der vorgegebenen Struktur aus.
- Status-Optionen:
  - "erfuellt": Das Kriterium ist vollständig erfüllt
  - "nicht_erfuellt": Das Kriterium ist nicht erfüllt
  - "teilweise": Das Kriterium ist teilweise erfüllt
  - "unklar": Aus dem Dokument geht nicht hervor, ob das Kriterium erfüllt ist
- Zitiere relevante Stellen aus dem Dokument als Beleg.
- Gib eine Confidence-Bewertung von 0-100 an.

## Output Format
{
  "status": "erfuellt" | "nicht_erfuellt" | "teilweise" | "unklar",
  "comment": string | null,
  "citations": [
    {
      "page": number,
      "quote": string
    }
  ],
  "confidence": number | null
}
```

---

## Anti-Hallucination Measures

### 1. Source-Bounded Prompts

**Instruction:**
```
Antworte **nur auf Basis der bereitgestellten Textauszüge**.
```

**Explanation:** LLM must not use external knowledge or make assumptions.

### 2. Mandatory Citations

**Instruction:**
```
**Jede inhaltliche Aussage muss ein Zitat enthalten**, sofern eine Quelle
auf den Seiten existiert.
```

**Schema Enforcement:**
```typescript
const citationSchema = v.object({
  documentId: v.optional(v.id("documents")),
  page: v.number(),
  quote: v.string(),
});
```

**Validation:** Zod rejects responses without citations.

### 3. Null for Missing Data

**Instruction:**
```
Fehlende Werte sind grundsätzlich mit `null` zu füllen.
```

**Rationale:** Prevents LLM from inventing data to fill fields.

### 4. Strict JSON Format

**Instruction:**
```
Gib **exakt ein einziges JSON-Objekt** aus. Kein Array, keine Kommentare,
kein Fließtext, keine Erklärungen.
```

**Validation:** JSON parsing fails if LLM adds prose.

### 5. Schema-Driven Output

**Approach:** Provide explicit JSON schema in system prompt.

**Example:**
```json
{
  "summary": "string | null",
  "milestones": [
    {
      "title": "string",
      "date": "string | null",
      "citation": { "page": "number", "quote": "string" } | null
    }
  ]
}
```

---

## JSON Parsing and Validation

### Parsing Strategy

**File:** `packages/backend/convex/analysis.ts:1363-1395`

```typescript
function tryParseJson(text: string): any {
  // Fast path: Direct parse
  try {
    return JSON.parse(text);
  } catch {}

  // Remove common code fences
  const fenced = /```json\s*([\s\S]*?)\s*```/i.exec(text);
  if (fenced && fenced[1]) {
    try { return JSON.parse(fenced[1].trim()); } catch {}
  }

  // Extract the largest JSON object or array substring
  const firstObj = text.indexOf("{");
  const lastObj = text.lastIndexOf("}");
  const firstArr = text.indexOf("[");
  const lastArr = text.lastIndexOf("]");

  const candidates: string[] = [];
  if (firstObj !== -1 && lastObj !== -1) {
    candidates.push(text.slice(firstObj, lastObj + 1));
  }
  if (firstArr !== -1 && lastArr !== -1) {
    candidates.push(text.slice(firstArr, lastArr + 1));
  }

  for (const c of candidates) {
    try { return JSON.parse(c); } catch {}
  }

  throw new Error("JSON parse failed. Raw text: " + truncate(text, 800));
}
```

**Fallback Mechanisms:**
1. Direct parse
2. Extract from ```json code blocks
3. Find largest JSON substring
4. Fail with diagnostic message

### Automatic Retry

**File:** `packages/backend/convex/analysis.ts:1298-1354`

```typescript
async function callLlmForJson(options) {
  const primary = await callLlm(options);

  try {
    const parsed = tryParseJson(primary.text);
    return { parsed, usage: primary.usage, ... };
  } catch (error) {
    // Retry with stricter instructions
    const retry = await callLlm({
      systemPrompt: options.systemPrompt +
        "\nAntworte ausschliesslich mit gültigem JSON ohne Erläuterung.",
      userPrompt: options.userPrompt +
        "\nBitte liefere strikt valides JSON ohne zusätzlichen Text.",
      ...options,
    });

    // Accumulate token usage from both calls
    // ...

    const parsed = tryParseJson(retry.text);
    return { parsed, usage, ... };
  }
}
```

**Rationale:** Some models (especially GPT-4) occasionally add prose despite instructions. Retry with even stricter prompt.

### Zod Validation

**File:** `packages/backend/convex/analysisSchemas.ts`

```typescript
import { z } from "zod";

export const citationSchema = z.object({
  page: z.number(),
  quote: z.string(),
});

export const standardResultSchema = z.object({
  summary: z.string().nullable(),
  milestones: z.array(
    z.object({
      title: z.string(),
      date: z.string().nullable().optional(),
      citation: citationSchema.nullable().optional(),
    }),
  ),
  requirements: z.array(
    z.object({
      title: z.string(),
      category: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      citation: citationSchema.nullable().optional(),
    }),
  ),
  metadata: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      citation: citationSchema.nullable().optional(),
    }),
  ),
});
```

**Usage:**
```typescript
const result = standardResultSchema.parse(parsed);
```

**Benefits:**
- Runtime type checking
- Automatic error messages
- Prevents malformed data from entering database

---

## Telemetry and Cost Optimization

### Tracked Metrics

**Recorded in `analysisRuns` table:**

```typescript
{
  provider: "OPENAI" | "ANTHROPIC",
  model: "gpt-4o-mini" | "claude-3-5-sonnet-20241022",
  promptTokens: number,
  completionTokens: number,
  latencyMs: number,
}
```

### Token Counting

**OpenAI:**
```typescript
const usage = {
  promptTokens: response.usage.prompt_tokens,
  completionTokens: response.usage.completion_tokens,
};
```

**Anthropic:**
```typescript
const usage = {
  promptTokens: response.usage.input_tokens,
  completionTokens: response.usage.output_tokens,
};
```

### Cost Calculation

**OpenAI GPT-4o-mini pricing:**
- Input: $0.15 per 1M tokens
- Output: $0.60 per 1M tokens

**Example:**
```typescript
const inputCost = (promptTokens / 1_000_000) * 0.15;
const outputCost = (completionTokens / 1_000_000) * 0.60;
const totalCost = inputCost + outputCost;
```

**Anthropic Claude 3.5 Sonnet pricing:**
- Input: $3.00 per 1M tokens
- Output: $15.00 per 1M tokens

### Optimization Strategies

1. **Chunking:** Reduce context window by processing ~15 pages at a time (configurable via `CONVEX_ANALYSIS_PAGES_PER_CHUNK`)
2. **Model Selection:** Use `gpt-4o-mini` for cost-sensitive operations
3. **Backpressure:** Limit concurrent runs to avoid rate limits and cost spikes
4. **Prompt Caching:** (Future) Cache common system prompts
5. **Result Reuse:** Store results immutably, never re-run same analysis

---

## Error Scenarios and Handling

### LLM API Errors

**Rate Limit (429):**
```typescript
// OpenAI returns 429 status
if (response.status === 429) {
  throw new Error("Rate limit erreicht. Bitte später erneut versuchen.");
}
```

**Solution:** Backpressure queue prevents excessive requests.

**Invalid API Key:**
```typescript
if (response.status === 401) {
  throw new Error("Ungültiger API-Schlüssel für LLM-Provider.");
}
```

**Timeout:**
```typescript
// Convex Actions have 10-minute timeout
// LLM calls should complete within 60 seconds per chunk
```

### Validation Errors

**Zod Validation Failure:**
```typescript
try {
  const result = standardResultSchema.parse(parsed);
} catch (error) {
  console.error("Validation failed:", error);
  throw new Error("LLM-Antwort entspricht nicht dem erwarteten Schema.");
}
```

**Missing Citations:**
- Prompt explicitly requires citations
- Zod schema allows `null` if no source found
- UI displays warning if citation missing

### JSON Parsing Errors

**Fallback Order:**
1. Direct parse
2. Code fence extraction
3. Substring extraction
4. Retry with stricter prompt
5. Fail with diagnostic

**Diagnostic Output:**
```typescript
throw new Error("JSON parse failed. Raw text: " + truncate(text, 800));
```

---

## Best Practices

### Prompt Engineering

1. **Be Explicit:** Define every field in the schema
2. **Use Examples:** Show expected output format
3. **Enforce Structure:** Use strong language ("MUST", "ausschliesslich")
4. **Provide Context:** Include criterion metadata in prompts
5. **Test Iteratively:** Refine prompts based on real-world failures

### Token Management

1. **Monitor Usage:** Track token consumption per run
2. **Set Limits:** Use `maxOutputTokens` to cap costs
3. **Optimize Prompts:** Remove unnecessary instructions
4. **Chunk Wisely:** Balance between API calls and context length

### Quality Assurance

1. **Validate with Zod:** Always validate LLM outputs
2. **Require Citations:** Make evidence mandatory
3. **Review Failures:** Log and analyze failed analyses
4. **Human-in-Loop:** Flag low-confidence results for review

---

## Future Enhancements

### Planned Improvements

1. **Prompt Caching:** Reduce costs by caching system prompts (Anthropic feature)
2. **Structured Outputs:** Use OpenAI's structured output mode (JSON mode)
3. **Multi-Provider Fallback:** Automatically retry with different provider on failure
4. **Fine-Tuning:** Custom model for Swiss tender terminology
5. **Parallel Processing:** Process multiple criteria simultaneously

### Research Areas

1. **Retrieval-Augmented Generation (RAG):** Improve citation accuracy
2. **Confidence Scoring:** Machine-learned quality estimation
3. **Active Learning:** Flag uncertain extractions for human review
4. **Domain Adaptation:** Swiss German support, abbreviation expansion

---

**LLM Integration maintained by:** Cloud Solution GmbH
**Next review:** After prompt updates or provider changes
