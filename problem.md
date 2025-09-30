# Analysis Queue Stalling – Detailed Problem Report

## Context
- Repository: `tenderav2`
- Convex backend: `packages/backend/convex`
- Frontend (React): `apps/web`
- Feature in focus: document analysis queue (Standard & Kriterien runs)
- Goal of recent work: move run dispatching off the browser and guarantee progress via backend queue workers (`analysis:kickQueue` + worker actions).

## Expected Flow (Standard Analysis)
1. User opens a project (`Dokumente` tab) and clicks **Analyse starten**.
2. Frontend calls `projects:startAnalysis` mutation. If capacity is available, it inserts an `analysisRuns` row with `status: "läuft"` (otherwise `"wartet"`).
3. The mutation schedules `internal.analysis.kickQueue`.
4. `kickQueue` should:
   - Promote queued runs (set `status: "läuft"`, populate `startedAt`).
   - For every active run lacking `dispatchedAt`, stamp it and schedule the appropriate worker (`runStandardQueueWorker`).
5. Worker fetches the project + doc pages, loops through chunks, calls the LLM, records the result, and fires `kickQueue` again.
6. UI updates: `analysis.getLatest` shows provider/model filled in, new result appears.

## Observed Behaviour
- After clicking **Analyse starten**:
  - Convex logs only show:
    - `projects:startAnalysis`
    - `analysis:kickQueue`
    - Supporting queries (`analysis:listRunsByOrg`, `projects:list`, etc.)
  - Logs **never** show `analysis:runStandardQueueWorker` or any LLM chunk calls.
- In Convex DB (`analysisRuns` table) the row remains:
  - `status: "läuft"`
  - `provider: "PENDING"`, `model: "PENDING"`
  - `promptTokens`, `completionTokens`, `finishedAt` remain `undefined`
  - `dispatchedAt` is set (timestamp) immediately after `kickQueue` runs.
- Frontend auto-runner effect (`useEffect` watching `runLatest`) fires, but action call returns quickly and nothing progresses.
- No errors appear in browser console or Convex function logs.

### Latest Log Snapshot
```
Sep 30, 14:25:30.139  projects:startAnalysis          success 17ms
Sep 30, 14:25:30.153  documents:listByProject         success 11ms
Sep 30, 14:25:30.154  projects:get                    success 12ms
Sep 30, 14:25:30.155  analysis:getLatest              success 13ms
Sep 30, 14:25:30.157  analysis:getPflichtenheft...    success 15ms
Sep 30, 14:25:30.158  analysis:getLatest              success 15ms
Sep 30, 14:25:30.181  projects:list                   success 39ms
Sep 30, 14:25:30.187  analysis:listRunsByOrg          success 12ms
Sep 30, 14:25:30.206  analysis:kickQueue              success 25ms
```
(No subsequent worker/action logs.)

## Hypothesis
Runs are promoted to `"läuft"` and marked `dispatchedAt`, but the actual worker never runs. Possible causes:
- `kickQueue` marks `dispatchedAt` yet fails before `ctx.scheduler.runAfter`.
- Scheduler enqueues worker but it crashes before logging.
- `analysis.runStandardQueueWorker` fails authorization/lookup silently.
- `executeStandardAnalysis` re-acquires a *different* run, causing mismatch.

## How to Reproduce
1. Ensure a project has processed document pages (`docPages` entries).
2. Clear Convex logs.
3. Click **Analyse starten** in the UI (Standard analysis).
4. Observe logs (no worker run).
5. Inspect `analysisRuns` for the org; you'll find the new run stuck as described.

## Relevant Code (Full Listings)
Below are the full source files involved in the current queue implementation.

### `packages/backend/convex/analysis.ts`
```
import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { getIdentityOrThrow } from "./auth";
import { callLlm } from "./llm";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { ConvexError } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import {
    citationSchema,
    criteriaItemSchema,
    standardResultSchema,
    standardResultJsonSchema,
    criteriaItemJsonSchema,
    pflichtenheftExtractionSchema,
    offerCheckResultSchema,
} from "./analysisSchemas";

const PAGES_PER_CHUNK = Number.parseInt(process.env.CONVEX_ANALYSIS_PAGES_PER_CHUNK ?? "10");

interface CriterionComputation {
	key: string;
	title: string;
	description?: string;
	hints?: string;
	answerType: "boolean" | "skala" | "text";
	weight: number;
	required: boolean;
	keywords?: string[];
	status: "gefunden" | "nicht_gefunden" | "teilweise";
	comment?: string;
	answer?: string;
	score?: number;
	citations: Array<{ page: number; quote: string }>;
}

export const runStandard = action({
	args: {
		projectId: v.id("projects"),
		docPageIds: v.array(v.id("docPages")),
	},
	handler: async (ctx, args) => {
		const identity = await getIdentityOrThrow(ctx);
		const project = (await ctx.runQuery(
			internal.analysis.getProjectForAnalysis,
			{ projectId: args.projectId },
		)) as Doc<"projects"> | null;
		if (!project || project.orgId !== identity.orgId) {
			throw new ConvexError("Projekt nicht gefunden.");
		}

		return await executeStandardAnalysis(ctx, {
			project,
			orgId: identity.orgId,
			userId: identity.userId,
			docPageIds: args.docPageIds,
		});
	},
});

// Convenience: auto-resolve doc pages for a project and run Standard analysis
export const runStandardForProject = action({
    args: {
        projectId: v.id("projects"),
    },
    handler: async (ctx, { projectId }) => {
        const identity = await getIdentityOrThrow(ctx);
        const project = (await ctx.runQuery(internal.analysis.getProjectForAnalysis, {
            projectId,
        })) as Doc<"projects"> | null;
        if (!project || project.orgId !== identity.orgId) {
            throw new ConvexError("Projekt nicht gefunden.");
        }

        console.log("[analysis] runStandardForProject: project=", projectId);

        return await executeStandardAnalysis(ctx, {
            project,
            orgId: identity.orgId,
            userId: identity.userId,
        });
    },
});

interface StandardAnalysisOptions {
    project: Doc<"projects">;
    orgId: string;
    userId: string;
    docPageIds?: Id<"docPages">[];
    expectedRunId?: Id<"analysisRuns">;
}

async function executeStandardAnalysis(
    ctx: ActionCtx,
    { project, orgId, userId, docPageIds, expectedRunId }: StandardAnalysisOptions,
) {
    const resolvedDocPageIds = docPageIds
        ?? ((await ctx.runQuery(internal.analysis.getDocPageIdsForProject, {
            projectId: project._id,
        })) as Id<"docPages">[]);

    if (resolvedDocPageIds.length === 0) {
        throw new ConvexError("Keine Dokumentseiten zum Analysieren gefunden.");
    }

    const pages = await fetchDocPages(ctx as any, resolvedDocPageIds, orgId, project._id);
    if (pages.length === 0) {
        throw new ConvexError("Keine Dokumentseiten zum Analysieren gefunden.");
    }

    const run = await acquireRun(ctx as any, project._id, orgId, "standard", {
        userId,
    });

    if (expectedRunId && run._id !== expectedRunId) {
        console.warn(
            "[analysis] executeStandardAnalysis: acquired different run",
            {
                expected: expectedRunId,
                actual: run._id,
                projectId: project._id,
            },
        );
    }

    const chunks = chunkPages(pages, PAGES_PER_CHUNK);

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalLatency = 0;
    let provider = run.provider;
    let model = run.model;

    const partialResults: Array<z.infer<typeof standardResultSchema>> = [];

    try {
        for (const chunk of chunks) {
            const { result, usage, latencyMs, meta } = await analyseStandardChunk(chunk);
            partialResults.push(result);
            if (usage.promptTokens) totalPromptTokens += usage.promptTokens;
            if (usage.completionTokens) totalCompletionTokens += usage.completionTokens;
            totalLatency += latencyMs;
            provider = meta.provider;
            model = meta.model;
        }

        const merged = mergeStandardResults(partialResults);
        const { resultId } = (await ctx.runMutation(internal.analysis.recordStandardResult, {
            projectId: project._id,
            runId: run._id,
            orgId,
            result: merged,
            telemetry: {
                provider,
                model,
                promptTokens: totalPromptTokens || undefined,
                completionTokens: totalCompletionTokens || undefined,
                latencyMs: totalLatency,
            },
        })) as { resultId: Id<"analysisResults"> };

        return { status: "fertig" as const, resultId };
    } catch (error) {
        await failRun(ctx as any, run._id, error);
        throw error;
    }
}

interface CriteriaAnalysisOptions {
    project: Doc<"projects">;
    template: Doc<"templates">;
    orgId: string;
    userId: string;
    docPageIds?: Id<"docPages">[];
    expectedRunId?: Id<"analysisRuns">;
}

async function executeCriteriaAnalysis(
    ctx: ActionCtx,
    { project, template, orgId, userId, docPageIds, expectedRunId }: CriteriaAnalysisOptions,
) {
    const resolvedDocPageIds = docPageIds
        ?? ((await ctx.runQuery(internal.analysis.getDocPageIdsForProject, {
            projectId: project._id,
        })) as Id<"docPages">[]);

    if (resolvedDocPageIds.length === 0) {
        throw new ConvexError("Keine Dokumentseiten zum Analysieren gefunden.");
    }

    const pages = await fetchDocPages(ctx as any, resolvedDocPageIds, orgId, project._id);
    if (pages.length === 0) {
        throw new ConvexError("Keine Dokumentseiten zum Analysieren gefunden.");
    }

    const run = await acquireRun(ctx as any, project._id, orgId, "criteria", {
        userId,
    });

    if (expectedRunId && run._id !== expectedRunId) {
        console.warn(
            "[analysis] executeCriteriaAnalysis: acquired different run",
            {
                expected: expectedRunId,
                actual: run._id,
                projectId: project._id,
            },
        );
    }

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalLatency = 0;
    let provider = run.provider;
    let model = run.model;

    try {
        const documentContext = buildDocumentContext(pages);
        const criteriaResults: CriterionComputation[] = [];

        for (const criterion of template.criteria) {
            const { result, usage, latencyMs, meta } = await analyseCriterion(
                criterion,
                documentContext,
            );
            criteriaResults.push({
                ...criterion,
                status: result.status,
                comment: result.comment,
                answer: result.answer,
                score: result.score,
                citations: result.citations ?? [],
            });
            if (usage.promptTokens) totalPromptTokens += usage.promptTokens;
            if (usage.completionTokens) totalCompletionTokens += usage.completionTokens;
            totalLatency += latencyMs;
            provider = meta.provider;
            model = meta.model;
        }

        const { resultId } = (await ctx.runMutation(internal.analysis.recordCriteriaResult, {
            projectId: project._id,
            runId: run._id,
            orgId,
            templateId: template._id,
            items: criteriaResults,
            telemetry: {
                provider,
                model,
                promptTokens: totalPromptTokens || undefined,
                completionTokens: totalCompletionTokens || undefined,
                latencyMs: totalLatency,
            },
        })) as { resultId: Id<"analysisResults"> };

        return { status: "fertig" as const, resultId };
    } catch (error) {
        await failRun(ctx as any, run._id, error);
        throw error;
    }
}

export const runCriteria = action({
	args: {
		projectId: v.id("projects"),
		templateId: v.id("templates"),
		docPageIds: v.array(v.id("docPages")),
	},
	handler: async (ctx, args) => {
		const identity = await getIdentityOrThrow(ctx);
		const project = (await ctx.runQuery(
			internal.analysis.getProjectForAnalysis,
			{ projectId: args.projectId },
		)) as Doc<"projects"> | null;
		const template = (await ctx.runQuery(
			internal.analysis.getTemplateForAnalysis,
			{ templateId: args.templateId },
		)) as Doc<"templates"> | null;

		if (!project || project.orgId !== identity.orgId) {
			throw new ConvexError("Projekt nicht gefunden.");
		}
		if (!template || template.orgId !== identity.orgId) {
			throw new ConvexError("Template nicht gefunden.");
		}

		return await executeCriteriaAnalysis(ctx, {
			project,
			template,
			orgId: identity.orgId,
			userId: identity.userId,
			docPageIds: args.docPageIds,
		});
	},
});

// Convenience: auto-resolve doc pages + project template and run Criteria analysis
export const runCriteriaForProject = action({
    args: {
        projectId: v.id("projects"),
    },
    handler: async (ctx, { projectId }) => {
        const identity = await getIdentityOrThrow(ctx);
        const project = (await ctx.runQuery(internal.analysis.getProjectForAnalysis, {
            projectId,
        })) as Doc<"projects"> | null;
        if (!project || project.orgId !== identity.orgId) {
            throw new ConvexError("Projekt nicht gefunden.");
        }
        if (!project.templateId) {
            throw new ConvexError("Für die Kriterien-Analyse muss ein Template gewählt sein.");
        }
        const template = (await ctx.runQuery(internal.analysis.getTemplateForAnalysis, {
            templateId: project.templateId,
        })) as Doc<"templates"> | null;
        if (!template || template.orgId !== identity.orgId) {
            throw new ConvexError("Template nicht gefunden.");
        }

        console.log("[analysis] runCriteriaForProject: project=", projectId);

        return await executeCriteriaAnalysis(ctx, {
            project,
            template,
            orgId: identity.orgId,
            userId: identity.userId,
        });
    },
});

export const getLatest = query({
	args: {
		projectId: v.id("projects"),
		type: v.union(v.literal("standard"), v.literal("criteria")),
	},
	handler: async (ctx, args) => {
		const identity = await getIdentityOrThrow(ctx);
		const project = await ctx.db.get(args.projectId);
		if (!project || project.orgId !== identity.orgId) {
			throw new ConvexError("Projekt nicht gefunden.");
		}

		const runs = await ctx.db
			.query("analysisRuns")
			.withIndex("by_projectId_type", (q) =>
				q.eq("projectId", args.projectId).eq("type", args.type),
			)
			.collect();

		if (runs.length === 0) {
			return { run: null, result: null };
		}

		runs.sort((a, b) => b.createdAt - a.createdAt);
		const latest = runs[0];

		let result = null;
		// Surface the most recent completed result even if a newer run is queued or running.
		for (const run of runs) {
			if (!run.resultId) {
				continue;
			}
			const stored = await ctx.db.get(run.resultId);
			if (stored && stored.orgId === identity.orgId) {
				result = args.type === "standard" ? stored.standard : stored.criteria;
				break;
			}
		}

		return {
			run: {
				_id: latest._id,
				status: latest.status,
				error: latest.error,
				queuedAt: latest.queuedAt,
				startedAt: latest.startedAt,
				finishedAt: latest.finishedAt,
				promptTokens: latest.promptTokens,
				completionTokens: latest.completionTokens,
				latencyMs: latest.latencyMs,
				provider: latest.provider,
				model: latest.model,
			},
			result,
		};
	},
});

export const getPflichtenheftExtractionStatus = query({
	args: {
		projectId: v.id("projects"),
	},
	handler: async (ctx, { projectId }) => {
		const identity = await getIdentityOrThrow(ctx);
		const project = await ctx.db.get(projectId);
		if (!project || project.orgId !== identity.orgId) {
			throw new ConvexError("Projekt nicht gefunden.");
		}

		const runs = await ctx.db
			.query("analysisRuns")
			.withIndex("by_projectId_type", (q) =>
				q.eq("projectId", projectId).eq("type", "pflichtenheft_extract"),
			)
			.collect();

		if (runs.length === 0) {
			return { run: null } as const;
		}

		runs.sort((a, b) => b.createdAt - a.createdAt);
		const latest = runs[0];

		return {
			run: {
				_id: latest._id,
				status: latest.status,
				error: latest.error,
				queuedAt: latest.queuedAt,
				startedAt: latest.startedAt,
				finishedAt: latest.finishedAt,
				provider: latest.provider,
				model: latest.model,
				promptTokens: latest.promptTokens,
				completionTokens: latest.completionTokens,
				latencyMs: latest.latencyMs,
		},
		} as const;
	},
});

async function fetchDocPages(
	ctx: ActionCtx,
	ids: Id<"docPages">[],
	orgId: string,
	projectId: Id<"projects">,
): Promise<Array<{ _id: Id<"docPages">; page: number; text: string }>> {
	return (await ctx.runQuery(internal.analysis.getDocPagesByIds, {
		docPageIds: ids,
		orgId,
		projectId,
	})) as Array<{ _id: Id<"docPages">; page: number; text: string }>;
}

function chunkPages(
	pages: Array<{ page: number; text: string }>,
	size: number,
) {
	const chunks: Array<{ pages: Array<{ page: number; text: string }>; text: string }>
		= [];

	for (let i = 0; i < pages.length; i += size) {
		const subset = pages.slice(i, i + size);
		const text = subset
			.map((page) => `Seite ${page.page}:\n${page.text}`)
			.join("\n\n");
		chunks.push({ pages: subset, text });
	}

	return chunks;
}

async function analyseStandardChunk(
	chunk: { pages: Array<{ page: number; text: string }>; text: string },
) {
	const systemPrompt = `Developer message
Du bist ein deutscher KI-Assistent zur strukturierten Analyse von HSE-Ausschreibungsunterlagen. Deine einzige Aufgabe ist es, basierend ausschließlich auf den gelieferten Dokumentseiten genau EIN valides JSON-Objekt gemäß der beschriebenen Struktur auszugeben.
<code_editing_rules>
<guiding_principles>
- **Exaktheit und Belegbarkeit**: Jede extrahierte Information muss durch ein Zitat aus dem Quelldokument belegt werden, sofern eine Quelle existiert. Annahmen sind zu vermeiden.
- **Vollständigkeit**: Alle Felder des Ziel-JSON-Schemas müssen ausgefüllt werden. Wenn keine Information gefunden wird, ist explizit \`null\` zu verwenden.
- **Strukturtreue**: Halte dich strikt an das vorgegebene JSON-Format, die Feldnamen und die Datentypen. Keine zusätzlichen Felder oder abweichenden Strukturen.
- **Präzision**: Fasse Informationen prägnant zusammen, aber bewahre den ursprünglichen Sinn und Kontext.
- **Fokus**: Konzentriere dich ausschließlich auf die Extraktion der geforderten Informationen. Interpretiere nicht über den Inhalt der Dokumente hinaus.
</guiding_principles>
<frontend_stack_defaults>
- **Sprache**: Deutsch
- **Output-Format**: JSON
- **Schema-Struktur**: Siehe "Output Format" Sektion.
</frontend_stack_defaults>
<ui_ux_best_practices>
- **Lesbarkeit**: Zitate müssen klar und verständlich sein und den extrahierten Datenpunkt direkt unterstützen.
- **Konsistenz**: Datumsangaben, Namen und Fachbegriffe müssen konsistent und korrekt wiedergegeben werden.
- **Fehlerbehandlung**: Bei unklaren oder widersprüchlichen Informationen im Quelldokument, dies im entsprechenden Feld vermerken oder das Feld auf \`null\` setzen, wenn keine klare Aussage getroffen werden kann.
</ui_ux_best_practices>
</code_editing_rules>
Vorgaben:
- Antworte **nur auf Deutsch**.
- Gib **exakt ein einziges JSON-Objekt** gemäß der vorgegebenen Struktur aus. Kein Array, keine Kommentare, kein Fließtext, keine Erklärungen.
- **Jede inhaltliche Aussage muss ein Zitat enthalten**, sofern eine Quelle auf den Seiten existiert.
- Fehlende Werte sind grundsätzlich mit \`null\` zu füllen, auch bei verschachtelten Objekten und für jedes Feld ohne Information.
- Die Seitenzahl im Citation-Objekt muss als Zahl (Numerus) angegeben werden, nicht als String.
- Halte dich strikt an die Feldnamen und die Struktur des Schemas; verwende keine zusätzlichen Felder oder Strukturen.
Arbeite exakt, beachte die Zitierregeln und gib **ausschließlich** das finale JSON-Objekt zurück.
Nach Fertigstellung prüfe die vollständige Korrektheit und Gültigkeit des ausgegebenen JSON-Objekts. Bei Fehlern sind diese intern zu beheben, sodass nur ein valides, finales JSON zurückgegeben wird.
Abbruchbedingung:
- Kein zusätzlicher Text oder Erklärungsausgabe.
- Keine Erklärungen.
- Die Syntax des JSON muss vollständig korrekt und valide sein.
## Output Format
Das auszugebende JSON-Objekt sieht wie folgt aus:
{
"summary": string | null, // Eine prägnante, neutrale und faktische Zusammenfassung des Projekts in 3-5 Sätzen. Konzentriere dich auf die wichtigsten Ziele, den Umfang, die Hauptanforderungen und den Zeitplan. Gib nur die Fakten aus dem Dokument wieder.
"milestones": [ // Eine Liste der wichtigsten projektbezogenen Termine und Fristen. WICHTIG: Extrahiere NUR Termine, die sich auf das Projekt selbst beziehen (z.B. Angebotsabgabe, Projektstart, Abgabefrist, Inbetriebnahme, Abnahme, wichtige Projektphasen). IGNORIERE Dokument-Metadaten wie "Dokument erstellt", "Dokument Version", "Erstellt am" oder ähnliche administrative Datumsangaben.
{
"title": string, // Der Name des Meilensteins (z.B. "Angebotsabgabe", "Projektstart", "Inbetriebnahme"). NIEMALS "Dokument erstellt" oder "Dokument Version".
"date": string | null, // Das Datum des Meilensteins im Format "YYYY-MM-DD". Wenn nur ein Monat oder Jahr angegeben ist, verwende das Format "YYYY-MM" oder "YYYY".
"citation": { "page": number, "quote": string } | null
}
],
"requirements": [ // Eine Liste der wichtigsten funktionalen und nicht-funktionalen Anforderungen an das Projekt.
{
  "title": string, // Eine kurze, prägnante Beschreibung der Anforderung.
  "category": string | null, // Eine Kategorie für die Anforderung (z.B. "Technisch", "Rechtlich", "Organisatorisch").
  "notes": string | null, // Zusätzliche Anmerkungen oder Details zur Anforderung.
  "citation": { "page": number, "quote": string } | null
}
],
"metadata": [ // Eine Liste von Metadaten zum Projekt, wie z.B. Ansprechpartner, Auftraggeber, etc.
{
"label": string, // Die Bezeichnung des Metadatums (z.B. "Auftraggeber", "Ansprechpartner").
"value": string, // Der Wert des Metadatums.
"citation": { "page": number, "quote": string } | null
}
]
}
Hinweise:
- Alle Felder sind immer im Output enthalten. Falls keine passenden Inhalte vorliegen, ist das jeweilige Feld bzw. Objekt mit \`null\` zu belegen.
- Arrays wie milestones, requirements und metadata können leer sein ([]), sind aber immer mit auszugeben.
- Nicht eindeutig belegbare Inhalte sind wegzulassen oder mit \`null\` zu kennzeichnen.
- Bei unvollständigem oder fehlendem Kontext sind alle Felder gemäß oben zu behandeln und keine Fehlerhinweise oder Meldungen auszugeben.`;

    const userPrompt = `Lies die folgenden Seiten und liefere genau EIN valides JSON-Objekt (kein Array, keine Erklärungen, keine Kommentare, kein Fließtext).

Seiten:
${chunk.text}`;

    const { parsed, usage, latencyMs, provider, model } = await callLlmForJson({
        systemPrompt,
        userPrompt,
        maxOutputTokens: 1800,
    });

    const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
    const result = standardResultSchema.parse(candidate);

	return {
		result,
		usage,
		latencyMs,
		meta: { provider, model },
	};
}

async function analyseCriterion(
	criterion: {
		key: string;
		title: string;
		description?: string;
		hints?: string;
		answerType: "boolean" | "skala" | "text";
		weight: number;
		required: boolean;
		keywords?: string[];
	},
	documentContext: string,
) {
	const systemPrompt =
		"Du bist ein deutschsprachiger Assistent zur Bewertung von Kriterien in Ausschreibungsunterlagen. Antworte ausschliesslich auf Deutsch und nur auf Basis der bereitgestellten Textauszüge.";
    const userPrompt = `Bewerte das folgende Kriterium anhand der bereitgestellten Dokumentseiten. Liefere GENAU EIN JSON-OBJEKT (kein Array, keine Erklärungen, kein Markdown) mit folgender Struktur:

{\n  \"status\": \"gefunden\" | \"nicht_gefunden\" | \"teilweise\",\n  \"comment\": string | null,\n  \"answer\": string | null,\n  \"score\": number | null,\n  \"citations\": [ { \"page\": number, \"quote\": string } ]\n}

Regeln:
- Gib ausschliesslich dieses JSON-Objekt zurück (kein Array, kein Fliesstext, keine Codeblöcke).
- Jede Aussage benötigt mindestens ein Zitat in \"citations\" (page + quote).
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

    const { parsed, usage, latencyMs, provider, model } = await callLlmForJson({
        systemPrompt,
        userPrompt,
        maxOutputTokens: 800,
    });

    const c = Array.isArray(parsed) ? parsed[0] : parsed;
    const validated = criteriaItemSchema.parse(c);

	return {
		result: validated,
		usage,
		latencyMs,
		meta: { provider, model },
	};
}

interface AcquireRunOptions {
	userId: string;
	offerId?: Id<"offers">;
}

async function acquireRun(
	ctx: ActionCtx,
	projectId: Id<"projects">,
	orgId: string,
	type: "standard" | "criteria" | "pflichtenheft_extract" | "offer_check",
	options: AcquireRunOptions,
): Promise<Doc<"analysisRuns">> {
	return (await ctx.runMutation(internal.analysis.acquireRunForAction, {
		projectId,
		orgId,
		type,
		userId: options.userId,
		offerId: options.offerId,
	})) as Doc<"analysisRuns">;
}

async function failRun(ctx: ActionCtx, runId: Id<"analysisRuns">, error: unknown): Promise<void> {
	const message =
		error instanceof Error ? error.message : "Analyse fehlgeschlagen.";
	await ctx.runMutation(internal.analysis.markRunFailed, {
		runId,
		error: message,
	});
}

function mergeStandardResults(results: z.infer<typeof standardResultSchema>[]) {
	const summary = results.map((result) => result.summary).join("\n\n");

	const milestones = dedupeByKey(results.flatMap((r) => r.milestones), (item) =>
		`${item.title}-${item.date ?? ""}`,
	);
	const requirements = dedupeByKey(
		results.flatMap((r) => r.requirements),
		(item) => `${item.title}-${item.category ?? ""}`,
	);
	const metadata = dedupeByKey(results.flatMap((r) => r.metadata), (item) => item.label);

	return {
		summary,
		milestones,
		requirements,
		metadata,
	};
}

function dedupeByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
	const map = new Map<string, T>();
	for (const item of items) {
		const key = keyFn(item);
		if (!map.has(key)) {
			map.set(key, item);
		}
	}
	return Array.from(map.values());
}

export const getProjectForAnalysis = internalQuery({
	args: {
		projectId: v.id("projects"),
	},
	handler: async (ctx, { projectId }) => {
		return await ctx.db.get(projectId);
	},
});

export const getRunForAnalysis = internalQuery({
    args: {
        runId: v.id("analysisRuns"),
    },
    handler: async (ctx, { runId }) => {
        return await ctx.db.get(runId);
    },
});

export const getTemplateForAnalysis = internalQuery({
	args: {
		templateId: v.id("templates"),
	},
	handler: async (ctx, { templateId }) => {
		return await ctx.db.get(templateId);
	},
});

export const getDocPagesByIds = internalQuery({
	args: {
		docPageIds: v.array(v.id("docPages")),
		orgId: v.string(),
		projectId: v.id("projects"),
	},
	handler: async (ctx, { docPageIds, orgId, projectId }) => {
		const pages: Array<{ _id: Id<"docPages">; page: number; text: string }> = [];
		for (const id of docPageIds) {
			const page = await ctx.db.get(id);
			if (!page || page.orgId !== orgId) {
				throw new ConvexError("Dokumentseite nicht gefunden oder ohne Berechtigung.");
			}
			const document = await ctx.db.get(page.documentId);
			if (!document || document.projectId !== projectId || document.orgId !== orgId) {
				throw new ConvexError("Dokumentseite gehört nicht zum Projekt.");
			}
			pages.push({ _id: page._id, page: page.page, text: page.text });
		}
		return pages.sort((a, b) => a.page - b.page);
	},
});

export const getDocPageIdsForProject = internalQuery({
    args: {
        projectId: v.id("projects"),
    },
    handler: async (ctx, { projectId }) => {
        const documents = await ctx.db
            .query("documents")
            .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
            .collect();
        const ids: Id<"docPages">[] = [] as any;
        for (const doc of documents) {
            const pages = await ctx.db
                .query("docPages")
                .withIndex("by_documentId", (q) => q.eq("documentId", doc._id))
                .collect();
            for (const page of pages) ids.push(page._id as any);
        }
        return ids;
    },
});

export const acquireRunForAction = internalMutation({
	args: {
		projectId: v.id("projects"),
		orgId: v.string(),
		userId: v.string(),
		type: v.union(
			v.literal("standard"),
			v.literal("criteria"),
			v.literal("pflichtenheft_extract"),
			v.literal("offer_check"),
		),
		offerId: v.optional(v.id("offers")),
	},
	handler: async (ctx, { projectId, orgId, userId, type, offerId }) => {
		const runs = await ctx.db
			.query("analysisRuns")
			.withIndex("by_projectId_type", (q) =>
				q.eq("projectId", projectId).eq("type", type),
			)
			.collect();

		const pending = runs
			.filter((run) => run.orgId === orgId)
			.filter((run) => run.status === "wartet" || run.status === "läuft")
			.sort((a, b) => a.createdAt - b.createdAt);

		if (pending.length === 0) {
			if (type === "standard" || type === "criteria") {
				throw new ConvexError("Keine aktive Analyse für dieses Projekt gefunden.");
			}

			if (type === "offer_check" && !offerId) {
				throw new ConvexError("Angebots-Analyse benötigt eine Angebots-ID.");
			}

			const now = Date.now();
			const runId = await ctx.db.insert("analysisRuns", {
				projectId,
				type,
				status: "läuft",
				error: undefined,
				queuedAt: now,
				startedAt: now,
				finishedAt: undefined,
				dispatchedAt: now,
				resultId: undefined,
				offerId: type === "offer_check" ? offerId ?? undefined : undefined,
				templateSnapshotId: undefined,
				provider: "PENDING",
				model: "PENDING",
				promptTokens: undefined,
				completionTokens: undefined,
				latencyMs: undefined,
				orgId,
				createdBy: userId,
				createdAt: now,
			});

			const created = await ctx.db.get(runId);
			if (!created) {
				throw new ConvexError("Analyse konnte nicht gestartet werden.");
			}
			return created;
		}

		const current = pending[0];
		if (current.status === "wartet") {
			const now = Date.now();
			await ctx.db.patch(current._id, {
				status: "läuft",
				startedAt: now,
				dispatchedAt: now,
			});
			const updated = await ctx.db.get(current._id);
			if (!updated) {
				throw new ConvexError("Analyse konnte nicht gestartet werden.");
			}
			return updated;
		}

		if (current.status === "läuft" && !current.dispatchedAt) {
			const now = Date.now();
			await ctx.db.patch(current._id, {
				dispatchedAt: now,
			});
			const updated = await ctx.db.get(current._id);
			if (!updated) {
				throw new ConvexError("Analyse konnte nicht gestartet werden.");
			}
			return updated;
		}

		return current;
	},
});

export const recordStandardResult = internalMutation({
	args: {
		projectId: v.id("projects"),
		runId: v.id("analysisRuns"),
		orgId: v.string(),
		result: v.any(),
		telemetry: v.object({
			provider: v.string(),
			model: v.string(),
			promptTokens: v.optional(v.number()),
			completionTokens: v.optional(v.number()),
			latencyMs: v.number(),
		}),
	},
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		if (!run || run.orgId !== args.orgId) {
			throw new ConvexError("Analyse nicht gefunden.");
		}

		const now = Date.now();
		const resultId = await ctx.db.insert("analysisResults", {
			projectId: args.projectId,
			runId: args.runId,
			type: "standard",
			standard: args.result,
			criteria: undefined,
			orgId: args.orgId,
			createdAt: now,
		});

		await ctx.db.patch(args.runId, {
			status: "fertig",
			finishedAt: now,
			resultId,
			error: undefined,
			promptTokens: args.telemetry.promptTokens,
			completionTokens: args.telemetry.completionTokens,
			latencyMs: args.telemetry.latencyMs,
			provider: args.telemetry.provider,
			model: args.telemetry.model,
		});

        await ctx.scheduler.runAfter(0, internal.analysis.kickQueue, {
            orgId: args.orgId,
        });

		return { resultId };
	},
});

export const recordCriteriaResult = internalMutation({
	args: {
		projectId: v.id("projects"),
		runId: v.id("analysisRuns"),
		orgId: v.string(),
		templateId: v.id("templates"),
		items: v.array(
			v.object({
				key: v.string(),
				title: v.string(),
				description: v.optional(v.string()),
				hints: v.optional(v.string()),
				answerType: v.union(
					v.literal("boolean"),
					v.literal("skala"),
					v.literal("text"),
				),
				weight: v.number(),
				required: v.boolean(),
				keywords: v.optional(v.array(v.string())),
				status: v.union(
					v.literal("gefunden"),
					v.literal("nicht_gefunden"),
					v.literal("teilweise"),
				),
				comment: v.optional(v.string()),
				answer: v.optional(v.string()),
				score: v.optional(v.number()),
				citations: v.array(
					v.object({
						page: v.number(),
						quote: v.string(),
					}),
				),
			}),
		),
		telemetry: v.object({
			provider: v.string(),
			model: v.string(),
			promptTokens: v.optional(v.number()),
			completionTokens: v.optional(v.number()),
			latencyMs: v.number(),
		}),
	},
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		if (!run || run.orgId !== args.orgId) {
			throw new ConvexError("Analyse nicht gefunden.");
		}

		const now = Date.now();
		const resultId = await ctx.db.insert("analysisResults", {
			projectId: args.projectId,
			runId: args.runId,
			type: "criteria",
			criteria: {
				templateId: args.templateId,
				summary: undefined,
				items: args.items.map((item) => ({
					criterionId: item.key,
					title: item.title,
					status: item.status,
					comment: item.comment,
					answer: item.answer,
					score: item.score,
					weight: item.weight,
					citations: item.citations,
				})),
			},
			standard: undefined,
			orgId: args.orgId,
			createdAt: now,
		});

		await ctx.db.patch(args.runId, {
			status: "fertig",
			finishedAt: now,
			resultId,
			error: undefined,
			promptTokens: args.telemetry.promptTokens,
			completionTokens: args.telemetry.completionTokens,
			latencyMs: args.telemetry.latencyMs,
			provider: args.telemetry.provider,
			model: args.telemetry.model,
		});

        await ctx.scheduler.runAfter(0, internal.analysis.kickQueue, {
            orgId: args.orgId,
        });

		return { resultId };
	},
});

export const markRunFailed = internalMutation({
	args: {
		runId: v.id("analysisRuns"),
		error: v.string(),
	},
	handler: async (ctx, { runId, error }) => {
		const run = await ctx.db.get(runId);
		if (!run) {
			throw new ConvexError("Analyse nicht gefunden.");
		}

		await ctx.db.patch(runId, {
			status: "fehler",
			error,
			finishedAt: Date.now(),
		});

        await ctx.scheduler.runAfter(0, internal.analysis.kickQueue, {
            orgId: run.orgId,
        });
	},
});

export const listRunsByOrg = internalQuery({
    args: {
        orgId: v.string(),
    },
    handler: async (ctx, { orgId }) => {
        const runs = await ctx.db
            .query("analysisRuns")
            .withIndex("by_orgId", (q) => q.eq("orgId", orgId))
            .collect();

        return runs;
    },
});

export const markRunStarted = internalMutation({
    args: {
        runId: v.id("analysisRuns"),
    },
    handler: async (ctx, { runId }) => {
        const run = await ctx.db.get(runId);
        if (!run) {
            throw new ConvexError("Analyse nicht gefunden.");
        }

        const now = Date.now();
		await ctx.db.patch(runId, {
			status: "läuft",
			startedAt: now,
			error: undefined,
		});
    },
});

export const markRunDispatched = internalMutation({
    args: {
        runId: v.id("analysisRuns"),
    },
    handler: async (ctx, { runId }) => {
        const run = await ctx.db.get(runId);
        if (!run) {
            throw new ConvexError("Analyse nicht gefunden.");
        }

        if (run.dispatchedAt) {
            return;
        }

        await ctx.db.patch(runId, {
            dispatchedAt: Date.now(),
        });
    },
});

export const runStandardQueueWorker = internalAction({
    args: {
        runId: v.id("analysisRuns"),
    },
    handler: async (ctx, { runId }) => {
        const run = (await ctx.runQuery(internal.analysis.getRunForAnalysis, {
            runId,
        })) as Doc<"analysisRuns"> | null;

        if (!run) {
            console.warn("[analysis] runStandardQueueWorker: run not found", { runId });
            return;
        }
        if (run.status !== "läuft") {
            return;
        }

        const project = (await ctx.runQuery(internal.analysis.getProjectForAnalysis, {
            projectId: run.projectId,
        })) as Doc<"projects"> | null;

        if (!project || project.orgId !== run.orgId) {
            await ctx.runMutation(internal.analysis.markRunFailed, {
                runId,
                error: "Projekt nicht gefunden (Queue Worker).",
            });
            return;
        }

        const userId = run.createdBy ?? "system";

        try {
            await executeStandardAnalysis(ctx as any, {
                project,
                orgId: run.orgId,
                userId,
                expectedRunId: run._id,
            });
        } catch (error) {
            await ctx.runMutation(internal.analysis.markRunFailed, {
                runId,
                error: error instanceof Error ? error.message : "Analyse fehlgeschlagen.",
            });
            throw error;
        }
    },
});

export const runCriteriaQueueWorker = internalAction({
    args: {
        runId: v.id("analysisRuns"),
    },
    handler: async (ctx, { runId }) => {
        const run = (await ctx.runQuery(internal.analysis.getRunForAnalysis, {
            runId,
        })) as Doc<"analysisRuns"> | null;

        if (!run) {
            console.warn("[analysis] runCriteriaQueueWorker: run not found", { runId });
            return;
        }
        if (run.status !== "läuft") {
            return;
        }

        const project = (await ctx.runQuery(internal.analysis.getProjectForAnalysis, {
            projectId: run.projectId,
        })) as Doc<"projects"> | null;
        if (!project || project.orgId !== run.orgId) {
            await ctx.runMutation(internal.analysis.markRunFailed, {
                runId,
                error: "Projekt nicht gefunden (Queue Worker).",
            });
            return;
        }

        const templateId = run.templateSnapshotId ?? project.templateId;
        if (!templateId) {
            await ctx.runMutation(internal.analysis.markRunFailed, {
                runId,
                error: "Kriterien-Template nicht verfügbar.",
            });
            return;
        }

        const template = (await ctx.runQuery(internal.analysis.getTemplateForAnalysis, {
            templateId,
        })) as Doc<"templates"> | null;

        if (!template || template.orgId !== run.orgId) {
            await ctx.runMutation(internal.analysis.markRunFailed, {
                runId,
                error: "Kriterien-Template nicht gefunden (Queue Worker).",
            });
            return;
        }

        const userId = run.createdBy ?? "system";

        try {
            await executeCriteriaAnalysis(ctx as any, {
                project,
                template,
                orgId: run.orgId,
                userId,
                expectedRunId: run._id,
            });
        } catch (error) {
            await ctx.runMutation(internal.analysis.markRunFailed, {
                runId,
                error: error instanceof Error ? error.message : "Analyse fehlgeschlagen.",
            });
            throw error;
        }
    },
});

export const kickQueue = internalAction({
    args: {
        orgId: v.string(),
    },
    handler: async (ctx, { orgId }) => {
        const runs = await ctx.runQuery(internal.analysis.listRunsByOrg, { orgId });
        if (runs.length === 0) {
            return;
        }

        const maxActiveRaw = process.env.CONVEX_MAX_ACTIVE_RUNS_PER_ORG ?? "1";
        const parsed = Number.parseInt(maxActiveRaw, 10);
        const maxActive = Number.isNaN(parsed) ? 1 : Math.max(1, parsed);

        const dispatch = async (run: Doc<"analysisRuns">) => {
            await ctx.runMutation(internal.analysis.markRunDispatched, { runId: run._id });
            switch (run.type) {
                case "standard": {
                    await ctx.scheduler.runAfter(0, internal.analysis.runStandardQueueWorker, {
                        runId: run._id,
                    });
                    break;
                }
                case "criteria": {
                    await ctx.scheduler.runAfter(0, internal.analysis.runCriteriaQueueWorker, {
                        runId: run._id,
                    });
                    break;
                }
                default:
                    break;
            }
        };

        const pendingDispatch = runs.filter(
            (run) => run.status === "läuft" && !run.dispatchedAt,
        );
        for (const run of pendingDispatch) {
            await dispatch(run);
        }

        let activeCount = runs.filter((run) => run.status === "läuft").length;
        const queued = runs
            .filter((run) => run.status === "wartet")
            .sort((a, b) => (a.queuedAt ?? 0) - (b.queuedAt ?? 0));

        for (const run of queued) {
            if (activeCount >= maxActive) {
                break;
            }

            await ctx.runMutation(internal.analysis.markRunStarted, { runId: run._id });
            activeCount += 1;
            await dispatch(run);
        }
    },
});

export const cleanStaleRuns = internalAction({
    args: {
        orgId: v.string(),
        timeoutMs: v.number(),
    },
    handler: async (ctx, { orgId, timeoutMs }) => {
        const now = Date.now();
        const runs = await ctx.runQuery(internal.analysis.listRunsByOrg, { orgId });
        const stale = runs.filter(
            (run) =>
                run.status === "läuft" &&
                run.startedAt !== undefined &&
                now - run.startedAt > timeoutMs,
        );

        for (const run of stale) {
            await ctx.db.patch(run._id, {
                status: "fehler",
                error: `Abgebrochen wegen Timeout (${timeoutMs}ms)`,
                finishedAt: now,
            });
        }

        if (stale.length > 0) {
            await ctx.scheduler.runAfter(0, internal.analysis.kickQueue, { orgId });
        }
    },
});

async function callLlmForJson({
    systemPrompt,
    userPrompt,
    maxOutputTokens,
    temperature,
}: {
    systemPrompt: string;
    userPrompt: string;
    maxOutputTokens: number;
    temperature?: number;
}) {
    const primary = await callLlm({
        systemPrompt,
        userPrompt,
        maxOutputTokens,
        temperature,
    });

	let usage = { ...primary.usage };
	let latencyMs = primary.latencyMs;
	let provider = primary.provider;
	let model = primary.model;

	try {
		const parsed = tryParseJson(primary.text);
		return { parsed, usage, latencyMs, provider, model };
	} catch (error) {
        const retry = await callLlm({
            systemPrompt:
                systemPrompt +
                "\nAntworte ausschliesslich mit gültigem JSON ohne Erläuterung.",
            userPrompt:
                userPrompt +
                "\nBitte liefere strikt valides JSON ohne zusätzlichen Text.",
            maxOutputTokens,
            temperature,
        });

		if (usage.promptTokens && retry.usage.promptTokens) {
			usage.promptTokens += retry.usage.promptTokens;
		} else if (retry.usage.promptTokens) {
			usage.promptTokens = retry.usage.promptTokens;
		}

		if (usage.completionTokens && retry.usage.completionTokens) {
			usage.completionTokens += retry.usage.completionTokens;
		} else if (retry.usage.completionTokens) {
			usage.completionTokens = retry.usage.completionTokens;
		}

		latencyMs += retry.latencyMs;
		provider = retry.provider;
		model = retry.model;

		const parsed = tryParseJson(retry.text);
		return { parsed, usage, latencyMs, provider, model };
	}
}

function buildDocumentContext(pages: Array<{ page: number; text: string }>) {
	return pages
		.map((page) => `Seite ${page.page}:\n${page.text}`)
		.join("\n\n");
}

function tryParseJson(text: string): any {
  // Fast path
  try {
    return JSON.parse(text);
  } catch {}

  // Remove common code fences
  const fenced = /```json\s*([\s\S]*?)\s*```/i.exec(text);
  if (fenced && fenced[1]) {
    const candidate = fenced[1].trim();
    try { return JSON.parse(candidate); } catch {}
  }

  // Extract the largest JSON object or array substring
  const firstObj = text.indexOf("{");
  const lastObj = text.lastIndexOf("}");
  const firstArr = text.indexOf("[");
  const lastArr = text.lastIndexOf("]");

  const hasObj = firstObj !== -1 && lastObj !== -1 && lastObj > firstObj;
  const hasArr = firstArr !== -1 && lastArr !== -1 && lastArr > firstArr;

  const candidates: string[] = [];
  if (hasObj) candidates.push(text.slice(firstObj, lastObj + 1));
  if (hasArr) candidates.push(text.slice(firstArr, lastArr + 1));

  for (const c of candidates) {
    try { return JSON.parse(c); } catch {}
  }

  // If still failing, surface the original content for debugging
  throw new Error("JSON parse failed. Raw text: " + truncate(text, 800));
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// ========== OFFERTEN-VERGLEICH ACTIONS ==========

/**
 * Extract criteria from Pflichtenheft document
 * Creates a template with extracted Muss- and Kann-Kriterien
 */
export const extractPflichtenheftCriteria = action({
	args: {
		projectId: v.id("projects"),
	},
	handler: async (ctx, args) => {
		const identity = await getIdentityOrThrow(ctx);
		const project = (await ctx.runQuery(
			internal.analysis.getProjectForAnalysis,
			{ projectId: args.projectId },
		)) as Doc<"projects"> | null;

		if (!project || project.orgId !== identity.orgId) {
			throw new ConvexError("Projekt nicht gefunden.");
		}

		// Get Pflichtenheft document pages
		const docPageIds = (await ctx.runQuery(
			internal.analysis.getDocPageIdsForProject,
			{ projectId: args.projectId },
		)) as Id<"docPages">[];

		if (docPageIds.length === 0) {
			throw new ConvexError("Keine Pflichtenheft-Dokumente zum Analysieren gefunden.");
		}

		const run = await acquireRun(ctx as any, project._id, identity.orgId, "pflichtenheft_extract", {
			userId: identity.userId,
		});
		const pages = await fetchDocPages(ctx as any, docPageIds, identity.orgId, project._id);

		if (pages.length === 0) {
			throw new ConvexError("Keine Dokumentseiten gefunden.");
		}

		try {
			const { result, usage, latencyMs, meta } = await analysePflichtenheft(pages);

			// Create template from extracted criteria
			const criteriaArray: Array<{
				key: string;
				title: string;
				description?: string;
				hints?: string;
				answerType: "boolean";
				weight: number;
				required: boolean;
			}> = [];

			// Add Muss-Kriterien
			result.mussCriteria.forEach((criterion, idx) => {
				const pages = Array.from(new Set(criterion.pages)).sort((a, b) => a - b);
				criteriaArray.push({
					key: `MUSS_${idx + 1}`,
					title: criterion.title,
					description: criterion.description ?? undefined,
					hints: criterion.hints ?? undefined,
					answerType: "boolean" as const,
					weight: 100,
					required: true,
					sourcePages: pages,
				});
			});

			// Add Kann-Kriterien
			result.kannCriteria.forEach((criterion, idx) => {
				const pages = Array.from(new Set(criterion.pages)).sort((a, b) => a - b);
				criteriaArray.push({
					key: `KANN_${idx + 1}`,
					title: criterion.title,
					description: criterion.description ?? undefined,
					hints: criterion.hints ?? undefined,
					answerType: "boolean" as const,
					weight: 50,
					required: false,
					sourcePages: pages,
				});
			});

			// Create template
			const now = Date.now();
			const templateId = await ctx.runMutation(internal.analysis.createTemplateFromExtraction, {
				projectId: project._id,
				orgId: identity.orgId,
				createdBy: identity.userId,
				name: `${project.name} - Kriterien`,
				description: `Automatisch extrahierte Kriterien aus Pflichtenheft`,
				language: "de",
				version: "1.0",
				criteria: criteriaArray,
			});

			// Mark run as finished
			await ctx.runMutation(internal.analysis.finishPflichtenheftRun, {
				runId: run._id,
				projectId: project._id,
				templateId: templateId as Id<"templates">,
				telemetry: {
					provider: meta.provider,
					model: meta.model,
					promptTokens: usage.promptTokens,
					completionTokens: usage.completionTokens,
					latencyMs,
				},
			});

			return { status: "fertig", templateId, criteriaCount: criteriaArray.length };
		} catch (error) {
			await failRun(ctx as any, run._id, error);
			throw error;
		}
	},
});

/**
 * Check a single offer against all criteria in the template
 */
export const checkOfferAgainstCriteria = action({
	args: {
		projectId: v.id("projects"),
		offerId: v.id("offers"),
	},
	handler: async (ctx, args) => {
		const identity = await getIdentityOrThrow(ctx);
		const project = (await ctx.runQuery(
			internal.analysis.getProjectForAnalysis,
			{ projectId: args.projectId },
		)) as Doc<"projects"> | null;

		if (!project || project.orgId !== identity.orgId) {
			throw new ConvexError("Projekt nicht gefunden.");
		}

		if (!project.templateId) {
			throw new ConvexError("Kein Template für dieses Projekt vorhanden.");
		}

		const template = (await ctx.runQuery(
			internal.analysis.getTemplateForAnalysis,
			{ templateId: project.templateId },
		)) as Doc<"templates"> | null;

		if (!template || template.orgId !== identity.orgId) {
			throw new ConvexError("Template nicht gefunden.");
		}

		// Get offer
		const offer = (await ctx.runQuery(internal.analysis.getOfferForAnalysis, {
			offerId: args.offerId,
		})) as any;

		if (!offer || offer.orgId !== identity.orgId) {
			throw new ConvexError("Angebot nicht gefunden.");
		}

		if (!offer.documentId) {
			throw new ConvexError("Kein Dokument für dieses Angebot hochgeladen.");
		}

		// Get offer document pages
		const docPageIds = (await ctx.runQuery(
			internal.analysis.getDocPageIdsForDocument,
			{ documentId: offer.documentId },
		)) as Id<"docPages">[];

		if (docPageIds.length === 0) {
			throw new ConvexError("Keine Dokumentseiten im Angebot gefunden.");
		}

		const run = await acquireRun(ctx as any, project._id, identity.orgId, "offer_check", {
			userId: identity.userId,
			offerId: args.offerId,
		});
		const pages = await fetchDocPages(ctx as any, docPageIds, identity.orgId, project._id);

		if (pages.length === 0) {
			throw new ConvexError("Keine Dokumentseiten gefunden.");
		}

		let totalPromptTokens = 0;
		let totalCompletionTokens = 0;
		let totalLatency = 0;
		let provider = run.provider;
		let model = run.model;

		try {
			// Check each criterion
			for (const criterion of template.criteria) {
				const { result, usage, latencyMs, meta } = await checkOfferCriterion(
					pages,
					criterion,
				);

				totalPromptTokens += usage.promptTokens ?? 0;
				totalCompletionTokens += usage.completionTokens ?? 0;
				totalLatency += latencyMs;
				provider = meta.provider;
				model = meta.model;

				// Store result
				await ctx.runMutation(internal.analysis.storeOfferCriterionResult, {
					projectId: project._id,
					offerId: args.offerId,
					runId: run._id,
					criterionKey: criterion.key,
					criterionTitle: criterion.title,
					required: criterion.required,
					weight: criterion.weight,
					status: result.status,
					comment: result.comment ?? undefined,
					citations: result.citations,
					confidence: result.confidence,
					provider: meta.provider,
					model: meta.model,
					orgId: identity.orgId,
				});
			}

			// Mark run as finished
			await ctx.runMutation(internal.analysis.finishOfferCheckRun, {
				runId: run._id,
				offerId: args.offerId,
				telemetry: {
					provider,
					model,
					promptTokens: totalPromptTokens || undefined,
					completionTokens: totalCompletionTokens || undefined,
					latencyMs: totalLatency,
				},
			});

			return { status: "fertig", criteriaChecked: template.criteria.length };
		} catch (error) {
			await failRun(ctx as any, run._id, error);
			throw error;
		}
	},
});

async function analysePflichtenheft(
	pages: Array<{ page: number; text: string }>,
) {
const systemPrompt = `Du bist ein deutscher KI-Assistent zur Analyse von Pflichtenheften. Deine Aufgabe ist es, aus dem vorliegenden Dokument alle Muss-Kriterien und Kann-Kriterien zu extrahieren.

Vorgaben:
- Antworte **nur auf Deutsch**.
- Gib **exakt ein einziges JSON-Objekt** gemäß der vorgegebenen Struktur aus.
- Muss-Kriterien sind obligatorisch und müssen erfüllt werden (z.B. "muss", "erforderlich", "zwingend").
- Kann-Kriterien sind optional oder wünschenswert (z.B. "kann", "sollte", "wünschenswert").
- Extrahiere nur explizit genannte Kriterien aus dem Dokument.
- Gib für jedes Kriterium das Feld "pages" an: eine Liste mit allen Seitenzahlen (1-basierte Nummerierung), auf denen das Kriterium im Dokument erwähnt wird.

## Output Format
{
  "mussCriteria": [
    {
      "title": string, // Kurzer Titel des Kriteriums
      "description": string | null, // Detaillierte Beschreibung falls vorhanden
      "hints": string | null, // Zusätzliche Hinweise oder Kontext
      "pages": number[] // Liste der Seitenzahlen (min. ein Eintrag)
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
}`;

	const pagesText = pages
		.map((page) => `Seite ${page.page}:\n${page.text}`)
		.join("\n\n");

	const userPrompt = `Analysiere das folgende Pflichtenheft und extrahiere alle Muss-Kriterien und Kann-Kriterien:\n\n${pagesText}`;

	const start = Date.now();
	const { text, usage, provider, model } = await callLlm({
		systemPrompt,
		userPrompt,
		temperature: 0.1,
	});
	const latencyMs = Date.now() - start;

	const parsed = tryParseJson(text);
	const result = pflichtenheftExtractionSchema.parse(parsed);

	return {
		result,
		usage,
		latencyMs,
		meta: { provider, model },
	};
}

async function checkOfferCriterion(
	pages: Array<{ page: number; text: string }>,
	criterion: {
		key: string;
		title: string;
		description?: string;
		hints?: string;
		required: boolean;
	},
) {
	const systemPrompt = `Du bist ein deutscher KI-Assistent zur Prüfung von Angeboten gegen definierte Kriterien. Deine Aufgabe ist es, ein Angebot gegen ein spezifisches Kriterium zu prüfen und zu bewerten, ob das Kriterium erfüllt ist.

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
  "comment": string | null, // Begründung der Bewertung
  "citations": [
    {
      "page": number,
      "quote": string
    }
  ],
  "confidence": number | null // 0-100
}`;

	const pagesText = pages
		.map((page) => `Seite ${page.page}:\n${page.text}`)
		.join("\n\n");

	const criterionText = `
Kriterium: ${criterion.title}
${criterion.description ? `Beschreibung: ${criterion.description}` : ""}
${criterion.hints ? `Hinweise: ${criterion.hints}` : ""}
Typ: ${criterion.required ? "Muss-Kriterium" : "Kann-Kriterium"}
`;

	const userPrompt = `Prüfe das folgende Angebot gegen dieses Kriterium:\n\n${criterionText}\n\nAngebot:\n\n${pagesText}`;

	const start = Date.now();
	const { text, usage, provider, model } = await callLlm({
		systemPrompt,
		userPrompt,
		temperature: 0.1,
	});
	const latencyMs = Date.now() - start;

	const parsed = tryParseJson(text);
	const result = offerCheckResultSchema.parse(parsed);

	return {
		result,
		usage,
		latencyMs,
		meta: { provider, model },
	};
}


// Internal mutations for Offerten-Vergleich

export const createTemplateFromExtraction = internalMutation({
	args: {
		projectId: v.id("projects"),
		orgId: v.string(),
		createdBy: v.string(),
		name: v.string(),
		description: v.string(),
		language: v.string(),
		version: v.string(),
		criteria: v.any(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const templateId = await ctx.db.insert("templates", {
			name: args.name,
			description: args.description,
			language: args.language,
			version: args.version,
			visibleOrgWide: false,
			criteria: args.criteria,
			orgId: args.orgId,
			createdBy: args.createdBy,
			createdAt: now,
			updatedAt: now,
		});

		// Update project to reference this template
		await ctx.db.patch(args.projectId, {
			templateId,
		});

		return templateId;
	},
});

export const finishPflichtenheftRun = internalMutation({
	args: {
		runId: v.id("analysisRuns"),
		projectId: v.id("projects"),
		templateId: v.id("templates"),
		telemetry: v.object({
			provider: v.string(),
			model: v.string(),
			promptTokens: v.optional(v.number()),
			completionTokens: v.optional(v.number()),
			latencyMs: v.number(),
		}),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		await ctx.db.patch(args.runId, {
			status: "fertig",
			finishedAt: now,
			templateSnapshotId: args.templateId,
			provider: args.telemetry.provider,
			model: args.telemetry.model,
			promptTokens: args.telemetry.promptTokens,
			completionTokens: args.telemetry.completionTokens,
			latencyMs: args.telemetry.latencyMs,
		});
	},
});

export const getOfferForAnalysis = internalQuery({
	args: {
		offerId: v.id("offers"),
	},
	handler: async (ctx, { offerId }) => {
		return await ctx.db.get(offerId);
	},
});

export const getDocPageIdsForDocument = internalQuery({
	args: {
		documentId: v.id("documents"),
	},
	handler: async (ctx, { documentId }) => {
		const pages = await ctx.db
			.query("docPages")
			.withIndex("by_documentId", (q) => q.eq("documentId", documentId))
			.collect();
		return pages.map((p) => p._id);
	},
});

export const storeOfferCriterionResult = internalMutation({
	args: {
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
		citations: v.any(),
		confidence: v.optional(v.number()),
		provider: v.string(),
		model: v.string(),
		orgId: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		await ctx.db.insert("offerCriteriaResults", {
			projectId: args.projectId,
			offerId: args.offerId,
			runId: args.runId,
			criterionKey: args.criterionKey,
			criterionTitle: args.criterionTitle,
			required: args.required,
			weight: args.weight,
			status: args.status,
			comment: args.comment,
			citations: args.citations,
			confidence: args.confidence,
			provider: args.provider,
			model: args.model,
			checkedAt: now,
			orgId: args.orgId,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const finishOfferCheckRun = internalMutation({
	args: {
		runId: v.id("analysisRuns"),
		offerId: v.id("offers"),
		telemetry: v.object({
			provider: v.string(),
			model: v.string(),
			promptTokens: v.optional(v.number()),
			completionTokens: v.optional(v.number()),
			latencyMs: v.number(),
		}),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		await ctx.db.patch(args.runId, {
			status: "fertig",
			finishedAt: now,
			provider: args.telemetry.provider,
			model: args.telemetry.model,
			promptTokens: args.telemetry.promptTokens,
			completionTokens: args.telemetry.completionTokens,
			latencyMs: args.telemetry.latencyMs,
		});

		// Update offers latest run status
		await ctx.db.patch(args.offerId, {
			latestRunId: args.runId,
			latestStatus: "fertig",
			updatedAt: now,
		});
	},
});
```

### `packages/backend/convex/projects.ts`
```
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getIdentityOrThrow } from "./auth";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

interface LatestRunSummary {
	_id: Id<"analysisRuns">;
	status: "wartet" | "läuft" | "fertig" | "fehler";
	createdAt: number;
	startedAt?: number;
	finishedAt?: number;
}

type LatestRunByType = {
	standard?: LatestRunSummary;
	criteria?: LatestRunSummary;
};

const PROJECT_TYPE_VALUES = ["standard", "offerten"] as const;
const projectTypeValidator = v.union(
	v.literal(PROJECT_TYPE_VALUES[0]),
	v.literal(PROJECT_TYPE_VALUES[1]),
);

const MAX_ACTIVE_RUNS_PER_ORG = Number.parseInt(
	process.env.CONVEX_MAX_ACTIVE_RUNS_PER_ORG ?? "1",
);

export const create = mutation({
	args: {
		name: v.string(),
		customer: v.string(),
		tags: v.array(v.string()),
		projectType: v.optional(projectTypeValidator),
		templateId: v.optional(v.id("templates")),
	},
	handler: async (ctx, args) => {
		const identity = await getIdentityOrThrow(ctx);

		let templateId: Id<"templates"> | undefined;
		if (args.templateId) {
			const template = await ctx.db.get(args.templateId);
			if (!template || template.orgId !== identity.orgId) {
				throw new Error("Template gehört nicht zur Organisation.");
			}
			templateId = args.templateId;
		}

		const projectId = await ctx.db.insert("projects", {
			name: args.name,
			customer: args.customer,
			tags: args.tags,
			projectType: args.projectType ?? PROJECT_TYPE_VALUES[0],
			templateId,
			latestRunId: undefined,
			orgId: identity.orgId,
			createdBy: identity.userId,
			createdAt: Date.now(),
		});

		return projectId;
	},
});

export const list = query({
	args: {
		filter: v.optional(v.string()),
	},
	handler: async (ctx, { filter }) => {
		const identity = await getIdentityOrThrow(ctx);

		const normalizedFilter = filter?.trim().toLowerCase();

		const projects = await ctx.db
			.query("projects")
			.withIndex("by_orgId", (q) => q.eq("orgId", identity.orgId))
			.collect();

		const filtered = normalizedFilter
			? projects.filter((project) => {
				const nameMatches = project.name
					.toLowerCase()
					.includes(normalizedFilter);
				const tagMatches = project.tags.some((tag) =>
					tag.toLowerCase().includes(normalizedFilter),
				);
				return nameMatches || tagMatches;
			})
			: projects;

		const latestRunsByProject = await loadLatestRuns(ctx, filtered.map((p) => p._id));

		return filtered.map((project) => ({
			project,
			runs: latestRunsByProject.get(project._id) ?? {},
		}));
	},
});

export const get = query({
	args: {
		projectId: v.id("projects"),
	},
	handler: async (ctx, { projectId }) => {
		const identity = await getIdentityOrThrow(ctx);
		const project = await ctx.db.get(projectId);

		if (!project || project.orgId !== identity.orgId) {
			throw new Error("Projekt nicht gefunden.");
		}

		const runs = await loadLatestRuns(ctx, [projectId]);
		return {
			project,
			runs: runs.get(projectId) ?? {},
		};
	},
});

export const startAnalysis = mutation({
	args: {
		projectId: v.id("projects"),
		type: v.union(v.literal("standard"), v.literal("criteria")),
	},
	handler: async (ctx, { projectId, type }) => {
		const identity = await getIdentityOrThrow(ctx);
		const project = await ctx.db.get(projectId);
		if (!project || project.orgId !== identity.orgId) {
			throw new Error("Projekt nicht gefunden.");
		}

		if (type === "criteria" && !project.templateId) {
			throw new Error("Für die Kriterien-Analyse muss ein Template gewählt sein.");
		}

		const activeRuns = await ctx.db
			.query("analysisRuns")
			.withIndex("by_orgId", (q) => q.eq("orgId", identity.orgId))
			.collect();

		const activeCount = activeRuns.filter(
			(run) => run.status === "wartet" || run.status === "läuft",
		).length;

		const maxActive = Number.isNaN(MAX_ACTIVE_RUNS_PER_ORG)
			? 1
			: Math.max(1, MAX_ACTIVE_RUNS_PER_ORG);
		const shouldStartImmediately = activeCount < maxActive;
		const now = Date.now();

		const runId = await ctx.db.insert("analysisRuns", {
			projectId,
			type,
			status: shouldStartImmediately ? "läuft" : "wartet",
			error: undefined,
			queuedAt: now,
			startedAt: shouldStartImmediately ? now : undefined,
			finishedAt: undefined,
			resultId: undefined,
			provider: "PENDING",
			model: "PENDING",
			promptTokens: undefined,
			completionTokens: undefined,
			latencyMs: undefined,
			orgId: identity.orgId,
			createdBy: identity.userId,
			createdAt: now,
		});

		await ctx.db.patch(projectId, { latestRunId: runId });

		await ctx.scheduler.runAfter(0, internal.analysis.kickQueue, {
			orgId: identity.orgId,
		});

		return {
			runId,
			status: shouldStartImmediately ? "läuft" : "wartet",
		};
	},
});

export const setTemplate = mutation({
	args: {
		projectId: v.id("projects"),
		templateId: v.optional(v.id("templates")),
	},
	handler: async (ctx, { projectId, templateId }) => {
		const identity = await getIdentityOrThrow(ctx);
		const project = await ctx.db.get(projectId);
		if (!project || project.orgId !== identity.orgId) {
			throw new Error("Projekt nicht gefunden.");
		}

		let normalizedTemplate: Id<"templates"> | undefined = undefined;
		if (templateId) {
			const template = await ctx.db.get(templateId);
			if (!template || template.orgId !== identity.orgId) {
				throw new Error("Template gehört nicht zur Organisation.");
			}
			normalizedTemplate = templateId;
		}

		await ctx.db.patch(projectId, {
			templateId: normalizedTemplate,
		});

		return { success: true };
	},
});

export const remove = mutation({
    args: {
        projectId: v.id("projects"),
    },
    handler: async (ctx, { projectId }) => {
        const identity = await getIdentityOrThrow(ctx);
        const project = await ctx.db.get(projectId);
        if (!project || project.orgId !== identity.orgId) {
            throw new Error("Projekt nicht gefunden.");
        }

        // Delete shares
        const shares = await ctx.db
            .query("shares")
            .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
            .collect();
        for (const share of shares) {
            await ctx.db.delete(share._id);
        }

        // Delete comments
        const comments = await ctx.db
            .query("comments")
            .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
            .collect();
        for (const comment of comments) {
            await ctx.db.delete(comment._id);
        }

        // Delete offers and their criteria results
        const offers = await ctx.db
            .query("offers")
            .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
            .collect();
        for (const offer of offers) {
            // Delete offer criteria results
            const offerResults = await ctx.db
                .query("offerCriteriaResults")
                .withIndex("by_offerId", (q) => q.eq("offerId", offer._id))
                .collect();
            for (const result of offerResults) {
                await ctx.db.delete(result._id);
            }
            await ctx.db.delete(offer._id);
        }

        // Delete analysis results and runs
        const results = await ctx.db
            .query("analysisResults")
            .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
            .collect();
        for (const res of results) {
            await ctx.db.delete(res._id);
        }
        const runs = await ctx.db
            .query("analysisRuns")
            .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
            .collect();
        for (const run of runs) {
            await ctx.db.delete(run._id);
        }

        // Delete documents and their pages; also delete storage blobs
        const documents = await ctx.db
            .query("documents")
            .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
            .collect();
        for (const doc of documents) {
            const pages = await ctx.db
                .query("docPages")
                .withIndex("by_documentId", (q) => q.eq("documentId", doc._id))
                .collect();
            for (const page of pages) {
                await ctx.db.delete(page._id);
            }
            try {
                await ctx.storage.delete(doc.storageId);
            } catch (e) {
                // ignore storage delete failures
            }
            await ctx.db.delete(doc._id);
        }

        // Finally, delete the project
        await ctx.db.delete(projectId);

        return { success: true };
    },
});

async function loadLatestRuns(
	ctx: QueryCtx | MutationCtx,
	projectIds: Id<"projects">[],
) {
	const runsByProject = new Map<Id<"projects">, LatestRunByType>();
	for (const projectId of projectIds) {
		runsByProject.set(projectId, {});
	}

	if (projectIds.length === 0) {
		return runsByProject;
	}

	for (const projectId of projectIds) {
		const runs = await ctx.db
			.query("analysisRuns")
			.withIndex("by_projectId", (q) => q.eq("projectId", projectId))
			.collect();

		const existing = runsByProject.get(projectId);
		if (!existing) {
			continue;
		}

		for (const run of runs) {
			const key = run.type as keyof LatestRunByType;
			const previous = existing[key];
			if (!previous || previous.createdAt < run.createdAt) {
				existing[key] = {
					_id: run._id,
					status: run.status,
					createdAt: run.createdAt,
					startedAt: run.startedAt,
					finishedAt: run.finishedAt,
				};
			}
		}
	}

	return runsByProject;
}
```

### `packages/backend/convex/schema.ts`
```
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const citationSchema = v.object({
	documentId: v.optional(v.id("documents")),
	page: v.number(),
	quote: v.string(),
});

const PROJECT_TYPE_VALUES = ["standard", "offerten"] as const;
const standardAnalysisSchema = v.object({
	summary: v.union(v.string(), v.null()),
	milestones: v.array(
		v.object({
			title: v.string(),
			date: v.optional(v.union(v.string(), v.null())),
			citation: v.optional(v.union(citationSchema, v.null())),
		}),
	),
	requirements: v.array(
		v.object({
			title: v.string(),
			category: v.optional(v.union(v.string(), v.null())),
			notes: v.optional(v.union(v.string(), v.null())),
			citation: v.optional(v.union(citationSchema, v.null())),
		}),
	),
	openQuestions: v.array(
		v.object({
			question: v.string(),
			citation: v.optional(v.union(citationSchema, v.null())),
		}),
	),
	metadata: v.array(
		v.object({
			label: v.string(),
			value: v.string(),
			citation: v.optional(v.union(citationSchema, v.null())),
		}),
	),
});

const criteriaItemSchema = v.object({
	criterionId: v.string(),
	title: v.string(),
	status: v.union(
		v.literal("gefunden"),
		v.literal("nicht_gefunden"),
		v.literal("teilweise"),
	),
	comment: v.optional(v.string()),
	answer: v.optional(v.string()),
	citations: v.array(citationSchema),
	score: v.optional(v.number()),
	weight: v.optional(v.number()),
});

const criteriaAnalysisSchema = v.object({
	templateId: v.optional(v.id("templates")),
	summary: v.optional(v.string()),
	items: v.array(criteriaItemSchema),
});

export default defineSchema({
	todos: defineTable({
		text: v.string(),
		completed: v.boolean(),
	}),
	projects: defineTable({
		name: v.string(),
		customer: v.string(),
		tags: v.array(v.string()),
		projectType: v.optional(
			v.union(
				v.literal(PROJECT_TYPE_VALUES[0]),
				v.literal(PROJECT_TYPE_VALUES[1]),
			),
		),
		templateId: v.optional(v.id("templates")),
		latestRunId: v.optional(v.id("analysisRuns")),
		orgId: v.string(),
		createdBy: v.string(),
		createdAt: v.number(),
	})
		.index("by_orgId", ["orgId"]),
	comments: defineTable({
		projectId: v.id("projects"),
		contextType: v.union(
			v.literal("general"),
			v.literal("milestone"),
			v.literal("criterion"),
		),
		referenceId: v.optional(v.string()),
		referenceLabel: v.optional(v.string()),
		content: v.string(),
		orgId: v.string(),
		createdBy: v.string(),
		createdAt: v.number(),
	})
		.index("by_projectId", ["projectId"])
		.index("by_orgId", ["orgId"]),
	documents: defineTable({
		projectId: v.id("projects"),
		filename: v.string(),
		mimeType: v.string(),
		size: v.number(),
		storageId: v.id("_storage"),
		pageCount: v.optional(v.number()),
		textExtracted: v.boolean(),
		role: v.optional(v.union(
			v.literal("pflichtenheft"),
			v.literal("offer"),
			v.literal("support"),
		)),
		orgId: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_projectId", ["projectId"])
		.index("by_projectId_role", ["projectId", "role"])
		.index("by_orgId", ["orgId"]),
	docPages: defineTable({
		documentId: v.id("documents"),
		page: v.number(),
		text: v.string(),
		orgId: v.string(),
	})
		.index("by_documentId", ["documentId"])
		.index("by_documentId_page", ["documentId", "page"]),
	templates: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
		language: v.string(),
		version: v.string(),
		visibleOrgWide: v.boolean(),
		criteria: v.array(
			v.object({
				key: v.string(),
				title: v.string(),
				description: v.optional(v.string()),
				hints: v.optional(v.string()),
				answerType: v.union(
					v.literal("boolean"),
					v.literal("skala"),
					v.literal("text"),
				),
				weight: v.number(),
				required: v.boolean(),
				keywords: v.optional(v.array(v.string())),
				sourcePages: v.optional(v.array(v.number())),
			}),
		),
		orgId: v.string(),
		createdBy: v.string(),
		updatedBy: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_orgId", ["orgId"])
		.index("by_visibility", ["visibleOrgWide"]),
	analysisRuns: defineTable({
		projectId: v.id("projects"),
		type: v.union(
			v.literal("standard"),
			v.literal("criteria"),
			v.literal("pflichtenheft_extract"),
			v.literal("offer_check"),
		),
		status: v.union(
			v.literal("wartet"),
			v.literal("läuft"),
			v.literal("fertig"),
			v.literal("fehler"),
		),
		error: v.optional(v.string()),
		queuedAt: v.number(),
		startedAt: v.optional(v.number()),
		finishedAt: v.optional(v.number()),
		dispatchedAt: v.optional(v.number()),
		resultId: v.optional(v.id("analysisResults")),
		offerId: v.optional(v.id("offers")),
		templateSnapshotId: v.optional(v.id("templates")),
		provider: v.string(),
		model: v.string(),
		promptTokens: v.optional(v.number()),
		completionTokens: v.optional(v.number()),
		latencyMs: v.optional(v.number()),
		orgId: v.string(),
		createdBy: v.string(),
		createdAt: v.number(),
	})
		.index("by_projectId", ["projectId"])
		.index("by_projectId_type", ["projectId", "type"])
		.index("by_orgId", ["orgId"]),
	analysisResults: defineTable({
		projectId: v.id("projects"),
		runId: v.id("analysisRuns"),
		type: v.union(v.literal("standard"), v.literal("criteria")),
		standard: v.optional(standardAnalysisSchema),
		criteria: v.optional(criteriaAnalysisSchema),
		orgId: v.string(),
		createdAt: v.number(),
	})
		.index("by_projectId", ["projectId"])
		.index("by_projectId_type", ["projectId", "type"])
		.index("by_type", ["type"]),
	shares: defineTable({
		projectId: v.id("projects"),
		token: v.string(),
		expiresAt: v.optional(v.number()),
		createdBy: v.string(),
		orgId: v.string(),
		createdAt: v.number(),
	})
		.index("by_token", ["token"])
		.index("by_projectId", ["projectId"]),
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
		.index("by_orgId", ["orgId"]),
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
		.index("by_runId", ["runId"]),
});
```

### `apps/web/src/routes/projekte.$id.standard.tsx`
```
import { useEffect, useMemo, useRef, useState } from "react";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@tendera/backend/convex/_generated/api";
import {
	MetadataCard,
	MilestonesCard,
	RequirementsCard,
	SummaryCard,
} from "@/components/analysis-cards";
import { Loader2, Trash2 } from "lucide-react";

import { StatusBadge, type AnalysisStatus } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { AuthStateNotice } from "@/components/auth-state-notice";
import { ProjectSectionLayout } from "@/components/project-section-layout";
import { useOrgAuth } from "@/hooks/useOrgAuth";

interface Citation {
	page: number;
	quote: string;
}

interface StandardMilestone {
	title: string;
	date?: string;
	citation?: Citation;
}

interface StandardRequirement {
	title: string;
	category?: string;
	notes?: string;
	citation?: Citation;
}

interface StandardOpenQuestion {
	question: string;
	citation?: Citation;
}

interface StandardMetadataItem {
	label: string;
	value: string;
	citation?: Citation;
}

interface StandardResult {
	summary: string;
	milestones: StandardMilestone[];
	requirements: StandardRequirement[];
	openQuestions: StandardOpenQuestion[];
	metadata: StandardMetadataItem[];
}

interface RunSummary {
	status: AnalysisStatus;
	error?: string | null;
}


export const Route = createFileRoute("/projekte/$id/standard")({
	component: ProjectStandardPage,
});

function ProjectStandardPage() {
	const { id: projectId } = Route.useParams();
	const navigate = useNavigate();
	const auth = useOrgAuth();
	const project = useQuery(
		api.projects.get,
		auth.authReady ? { projectId: projectId as any } : "skip",
	);
	const standard = useQuery(
		api.analysis.getLatest,
		auth.authReady
			? {
				projectId: projectId as any,
				type: "standard",
			}
			: "skip",
	);
	const runStandardForProject = useAction(api.analysis.runStandardForProject);
	const runLatest = standard?.run;
	const autoStartRef = useRef<string | null>(null);

	useEffect(() => {
		if (
			runLatest &&
			runLatest.status === "läuft" &&
			runLatest.provider === "PENDING" &&
			autoStartRef.current !== runLatest._id
		) {
			autoStartRef.current = runLatest._id;
			runStandardForProject({ projectId: projectId as any }).catch(() => {});
		}
	}, [projectId, runLatest?._id, runLatest?.status, runLatest?.provider, runStandardForProject]);

	const standardResult = useMemo<StandardResult | null>(() => {
		const result = standard?.result;
		if (isStandardResult(result)) {
			return result;
		}
		return null;
	}, [standard]);

	const runSummary = useMemo<RunSummary | null>(() => {
		if (!standard?.run) {
			return null;
		}
		return {
			status: standard.run.status,
			error: standard.run.error,
		};
	}, [standard]);

	const removeProject = useMutation(api.projects.remove);

	const projectMeta = project?.project;
	const isLoading = project === undefined || standard === undefined;
	const [isDeleting, setDeleting] = useState(false);

	if (auth.orgStatus !== "ready") {
		return <AuthStateNotice status={auth.orgStatus} />;
	}

	const handleDeleteProject = async () => {
		const ok = window.confirm(
			"Dieses Projekt endgültig löschen? Alle Dokumente, Seiten und Analyse-Läufe werden entfernt.",
		);
		if (!ok) return;
		setDeleting(true);
		try {
			await removeProject({ projectId: projectId as any });
			toast.success("Projekt gelöscht.");
			navigate({ to: "/projekte" });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Projekt konnte nicht gelöscht werden.");
		} finally {
			setDeleting(false);
		}
	};

	return (
		<ProjectSectionLayout
			projectId={projectId}
			projectName={projectMeta?.name}
			customer={projectMeta?.customer ?? null}
			section={{
				id: "standard",
				title: "Standard-Analyse",
				description:
					"Automatisch extrahierte Zusammenfassung, Meilensteine, Anforderungen und wichtige Informationen aus Ihren Dokumenten.",
			}}
			statusBadge={<StatusBadge status={runSummary?.status ?? "wartet"} />}
			actions={
				<Button
					variant="ghost"
					size="icon"
					onClick={handleDeleteProject}
					disabled={isDeleting}
					title="Projekt löschen"
					aria-label="Projekt löschen"
				>
					{isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
				</Button>
			}
			headerContent={
				runSummary?.error || runSummary?.status === "läuft" || runSummary?.status === "wartet"
					? runSummary.error
						? `Analyse fehlgeschlagen: ${runSummary.error}`
						: runSummary.status === "läuft"
							? "Analyse läuft – Ergebnisse werden nach Abschluss angezeigt."
							: runSummary.status === "wartet"
								? "Analyse ist in der Warteschlange."
								: null
					: null
			}
		>
			<section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
				<div className="space-y-6">
					<SummaryCard
						summary={standardResult?.summary}
						isLoading={isLoading}
					/>
					<MilestonesCard
						milestones={standardResult?.milestones ?? []}
						isLoading={isLoading}
					/>
					<RequirementsCard
						requirements={standardResult?.requirements ?? []}
						isLoading={isLoading}
					/>
				</div>
				<div className="space-y-6">
					<MetadataCard
						metadata={standardResult?.metadata ?? []}
						isLoading={isLoading}
					/>
				</div>
			</section>
		</ProjectSectionLayout>
	);
}

function isStandardResult(value: unknown): value is StandardResult {
	if (!value || typeof value !== "object") {
		return false;
	}
	return (
		"summary" in value &&
		"milestones" in value &&
		Array.isArray((value as StandardResult).milestones) &&
		Array.isArray((value as StandardResult).requirements) &&
		Array.isArray((value as StandardResult).openQuestions) &&
		Array.isArray((value as StandardResult).metadata)
	);
}
```

### `apps/web/src/routes/projekte.$id.kriterien.tsx`
```
import { useEffect, useMemo, useRef, useState } from "react";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@tendera/backend/convex/_generated/api";
import { CriteriaDetail, CriteriaList } from "@/components/criteria-panel";
import type { CriteriaDetailData, CriteriaListItem } from "@/components/criteria-panel";
import { Loader2, Trash2 } from "lucide-react";

import { StatusBadge, type AnalysisStatus } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthStateNotice } from "@/components/auth-state-notice";
import { ProjectSectionLayout } from "@/components/project-section-layout";
import { useOrgAuth } from "@/hooks/useOrgAuth";

interface RunSummary {
	status: AnalysisStatus;
	error?: string | null;
}

interface TemplateOption {
	_id: string;
	name: string;
	version?: string;
	language?: string;
}

export const Route = createFileRoute("/projekte/$id/kriterien")({
    component: ProjectCriteriaPage,
});

function ProjectCriteriaPage() {
    const { id: projectId } = Route.useParams();
    const navigate = useNavigate();
	const auth = useOrgAuth();
	const project = useQuery(
		api.projects.get,
		auth.authReady ? { projectId: projectId as any } : "skip",
	);
	const criteriaResult = useQuery(
		api.analysis.getLatest,
		auth.authReady
			? {
				projectId: projectId as any,
				type: "criteria",
			}
			: "skip",
	);
	const documents = useQuery(
		api.documents.listByProject,
		auth.authReady ? { projectId: projectId as any } : "skip",
	);
	const templates = useQuery(
		api.templates.list,
		auth.authReady ? undefined : "skip",
	) as TemplateOption[] | undefined;
	const templateDoc = useQuery(
		api.templates.get,
		auth.authReady && project?.project.templateId
			? { templateId: project.project.templateId as any }
			: "skip",
	);

	const templateCriteriaMap = useMemo(() => {
		const map = new Map<string, any>();
		if (templateDoc) {
			for (const criterion of templateDoc.criteria) {
				map.set(criterion.key, criterion);
			}
		}
		return map;
	}, [templateDoc]);

    const startAnalysis = useMutation(api.projects.startAnalysis);
    const runCriteriaForProject = useAction(api.analysis.runCriteriaForProject);
    const removeProject = useMutation(api.projects.remove);
	const setTemplate = useMutation(api.projects.setTemplate);

    const runLatest = criteriaResult?.run;
    const autoStartRef = useRef<string | null>(null);

    useEffect(() => {
        if (
            runLatest &&
            runLatest.status === "läuft" &&
            runLatest.provider === "PENDING" &&
            autoStartRef.current !== runLatest._id
        ) {
            autoStartRef.current = runLatest._id;
            runCriteriaForProject({ projectId: projectId as any }).catch(() => {});
        }
    }, [projectId, runCriteriaForProject, runLatest?._id, runLatest?.status, runLatest?.provider]);

    const runSummary = useMemo<RunSummary | null>(() => {
		if (!criteriaResult?.run) {
			return null;
		}
		return {
			status: criteriaResult.run.status,
			error: criteriaResult.run.error,
		};
	}, [criteriaResult]);

	const computedCriteria = useMemo<CriteriaDetailData[]>(() => {
		const result = criteriaResult?.result;
		if (isCriteriaResult(result)) {
			return result.items.map((item) => {
				const templateCriterion = templateCriteriaMap.get(item.criterionId);
				return {
					...item,
					status: mapCriteriaStatus(item.status),
					citations: item.citations ?? [],
					sourcePages: templateCriterion?.sourcePages ?? [],
					weight: item.weight ?? templateCriterion?.weight,
				};
			});
		}
		if (templateDoc) {
			return templateDoc.criteria.map((criterion) => ({
				criterionId: criterion.key,
				title: criterion.title,
				description: criterion.description ?? undefined,
				hints: criterion.hints ?? undefined,
				status: "unbekannt" as const,
				comment: undefined,
				answer: undefined,
				score: undefined,
				weight: criterion.weight,
				citations: [],
				sourcePages: criterion.sourcePages ?? [],
			}));
		}
		return [];
	}, [criteriaResult, templateDoc, templateCriteriaMap]);

	const items: CriteriaListItem[] = useMemo(
		() =>
			computedCriteria.map((item) => ({
				criterionId: item.criterionId,
				title: item.title,
				status: item.status,
			})),
		[computedCriteria],
	);

	const statusBreakdown = useMemo(() => {
		return computedCriteria.reduce(
			(acc, item) => {
				acc[item.status] = (acc[item.status] ?? 0) + 1;
				return acc;
			},
			{ gefunden: 0, teilweise: 0, nicht_gefunden: 0, unbekannt: 0 } as Record<CriteriaListItem["status"], number>,
		);
	}, [computedCriteria]);

	const [selectedId, setSelectedId] = useState<string | undefined>(items[0]?.criterionId);
	const activeCriterion = useMemo(() => {
		if (!selectedId && computedCriteria.length > 0) {
			return computedCriteria[0];
		}
		return computedCriteria.find((item) => item.criterionId === selectedId);
	}, [computedCriteria, selectedId]);

	const hasTemplate = Boolean(project?.project.templateId);
	const hasPages = useMemo(
		() => (documents ?? []).some((doc) => doc.textExtracted && (doc.pageCount ?? 0) > 0),
		[documents],
	);

    const [isAssigningTemplate, setAssigningTemplate] = useState(false);
    const [isDeleting, setDeleting] = useState(false);

	if (auth.orgStatus !== "ready") {
		return <AuthStateNotice status={auth.orgStatus} />;
	}

	const handleTemplateChange = async (templateId: string) => {
		setAssigningTemplate(true);
		try {
			await setTemplate({
				projectId: projectId as any,
				templateId: templateId ? (templateId as any) : undefined,
			});
			toast.success("Kriterienkatalog aktualisiert.");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Kriterienkatalog konnte nicht gespeichert werden.",
			);
		} finally {
			setAssigningTemplate(false);
		}
	};

    const handleStart = async () => {
        if (!hasTemplate) {
            toast.error("Bitte zuerst einen Kriterienkatalog zuweisen.");
            return;
        }
        if (!hasPages) {
            toast.error("Bitte zuerst Dokumente hochladen und extrahieren.");
            return;
        }
        try {
            const res = (await startAnalysis({ projectId: projectId as any, type: "criteria" })) as
                | { status: "läuft" | "wartet"; runId: string }
                | undefined;
            if (res?.status === "läuft") {
                await runCriteriaForProject({ projectId: projectId as any });
            }
            toast.success("Kriterien-Analyse gestartet.");
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Analyse konnte nicht gestartet werden.",
            );
        }
    };

    const handleDeleteProject = async () => {
        const ok = window.confirm(
            "Dieses Projekt endgültig löschen? Alle Dokumente, Seiten und Analyse-Läufe werden entfernt.",
        );
        if (!ok) return;
        setDeleting(true);
        try {
            await removeProject({ projectId: projectId as any });
            toast.success("Projekt gelöscht.");
            navigate({ to: "/projekte" });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Projekt konnte nicht gelöscht werden.");
        } finally {
            setDeleting(false);
        }
    };

	const isLoading =
		project === undefined || criteriaResult === undefined || documents === undefined || templates === undefined;
	const currentTemplate = useMemo(
		() => templates?.find((entry) => entry._id === project?.project.templateId) ?? null,
		[templates, project?.project.templateId],
	);

	return (
		<ProjectSectionLayout
			projectId={projectId}
			projectName={project?.project.name}
			customer={project?.project.customer ?? null}
			section={{
				id: "kriterien",
				title: "Kriterien-Analyse",
				description: "Prüfung Ihrer Dokumente anhand individueller Anforderungen und Kriterien.",
			}}
			statusBadge={<StatusBadge status={runSummary?.status ?? "wartet"} />}
			actions={
				<div className="flex flex-wrap items-center gap-2">
					<Button size="sm" onClick={handleStart} disabled={!hasPages || !hasTemplate}>
						Analyse starten
					</Button>
					<Button
						variant="ghost"
						size="icon"
						onClick={handleDeleteProject}
						disabled={isDeleting}
						title="Projekt löschen"
						aria-label="Projekt löschen"
					>
						{isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
					</Button>
				</div>
			}
			headerContent={
				runSummary?.error || runSummary?.status === "läuft" || runSummary?.status === "wartet"
					? runSummary.error
						? `Analyse fehlgeschlagen: ${runSummary.error}`
						: runSummary.status === "läuft"
							? "Analyse läuft – Ergebnisse erscheinen nach Abschluss."
							: runSummary.status === "wartet"
								? "Analyse ist in der Warteschlange."
								: null
					: null
			}
		>
			<TemplateAssignmentCard
				isLoading={templates === undefined}
				templates={templates ?? []}
				currentTemplate={currentTemplate}
				onChange={handleTemplateChange}
				isAssigning={isAssigningTemplate}
			/>

			{!hasPages ? (
				<Card>
					<CardContent className="text-sm text-muted-foreground">
						Es wurden noch keine Dokumentseiten extrahiert. Lade Dokumente im Reiter „Dokumente“ hoch, um die Analyse zu starten.
					</CardContent>
				</Card>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>Kriterien</CardTitle>
					<CardDescription>
						Ergebnisse der Analyse – Muss-Kriterien zuerst, danach optionale Anforderungen.
					</CardDescription>
					<div className="flex flex-wrap gap-2 pt-3 text-xs text-muted-foreground">
						<StatusPill label="Gefunden" tone="success" value={statusBreakdown.gefunden} />
						<StatusPill label="Teilweise" tone="warn" value={statusBreakdown.teilweise} />
						<StatusPill label="Nicht gefunden" tone="error" value={statusBreakdown.nicht_gefunden} />
						<StatusPill label="Nicht bewertet" tone="muted" value={statusBreakdown.unbekannt} />
					</div>
				</CardHeader>
				<CardContent>
					{items.length === 0 ? (
						<div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
							<p className="text-sm font-medium text-foreground">
								Noch keine Kriterien vorhanden
							</p>
							<p className="mt-1 text-xs text-muted-foreground">
								Weise einen Kriterienkatalog zu oder starte eine Analyse, um Kriterien anzuzeigen.
							</p>
						</div>
					) : activeCriterion ? (
						<div className="grid gap-6 lg:grid-cols-[320px_1fr]">
							<div className="lg:sticky lg:top-28">
								<CriteriaList items={items} selectedId={selectedId} onSelect={setSelectedId} />
							</div>
							<CriteriaDetail criterion={activeCriterion} />
						</div>
					) : null}
				</CardContent>
			</Card>
		</ProjectSectionLayout>
	);
}

interface CriteriaResultItem
	extends Omit<CriteriaDetailData, "status" | "citations"> {
	status?: CriteriaDetailData["status"];
	citations?: CriteriaDetailData["citations"];
}

interface CriteriaResultPayload {
	items: CriteriaResultItem[];
}


function TemplateAssignmentCard({
	isLoading,
	templates,
	currentTemplate,
	onChange,
	isAssigning,
}: {
	isLoading: boolean;
	templates: TemplateOption[];
	currentTemplate: TemplateOption | null;
	onChange: (templateId: string) => Promise<void>;
	isAssigning: boolean;
}) {
	const templateKey = currentTemplate?._id ?? "";
	const [selected, setSelected] = useState(templateKey);

	useEffect(() => {
		setSelected(templateKey);
	}, [templateKey]);

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		await onChange(selected);
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Kriterienkatalog</CardTitle>
				<CardDescription>
					{currentTemplate
						? `Aktuell: ${currentTemplate.name}${currentTemplate.version ? ` · ${currentTemplate.version}` : ""}`
						: "Wähle einen Kriterienkatalog, um die Kriterien-Analyse zu aktivieren."}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<p className="text-sm text-muted-foreground">Lade Kriterienkataloge …</p>
				) : templates.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						Noch keine Kriterienkataloge vorhanden. Erstelle einen im Bereich „Kriterienkataloge".
					</p>
				) : (
					<form className="flex flex-col gap-3 sm:flex-row sm:items-center" onSubmit={handleSubmit}>
						<select
							value={selected}
							onChange={(event) => setSelected(event.target.value)}
							className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
						>
							<option value="">Kein Katalog</option>
							{templates.map((template) => (
								<option key={template._id} value={template._id}>
									{template.name}
									{template.version ? ` · ${template.version}` : ""}
								</option>
							))}
						</select>
						<Button type="submit" disabled={isAssigning}>
							{isAssigning ? "Speichere …" : "Katalog zuweisen"}
						</Button>
					</form>
				)}
			</CardContent>
		</Card>
	);
}

function isCriteriaResult(value: unknown): value is CriteriaResultPayload {
	if (!value || typeof value !== "object") {
		return false;
	}
	return Array.isArray((value as CriteriaResultPayload).items);
}

function mapCriteriaStatus(
	status: "gefunden" | "nicht_gefunden" | "teilweise" | "unbekannt" | undefined,
): "gefunden" | "nicht_gefunden" | "teilweise" | "unbekannt" {
	return status ?? "unbekannt";
}

function StatusPill({
	label,
	value,
	tone,
}: {
	label: string;
	value: number;
	tone: "success" | "warn" | "error" | "muted";
}) {
	const toneClass = {
		success: "bg-emerald-100 text-emerald-900",
		warn: "bg-amber-100 text-amber-900",
		error: "bg-rose-100 text-rose-900",
		muted: "bg-muted text-muted-foreground",
	}[tone];

	return (
		<span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-medium ${toneClass}`}>
			{label}
			<span className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold text-foreground">
				{value}
			</span>
		</span>
	);
}
```
