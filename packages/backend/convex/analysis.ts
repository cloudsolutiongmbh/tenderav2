import { action, internalMutation, internalQuery, query } from "./_generated/server";
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

		const pages = await fetchDocPages(ctx, args.docPageIds, identity.orgId, project._id);
		if (pages.length === 0) {
			throw new ConvexError("Keine Dokumentseiten zum Analysieren gefunden.");
		}

		const run = await acquireRun(ctx, project._id, identity.orgId, "standard", {
			userId: identity.userId,
		});
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
			const now = Date.now();
			const { resultId } = (await ctx.runMutation(
				internal.analysis.recordStandardResult,
				{
					projectId: project._id,
					runId: run._id,
					orgId: identity.orgId,
					result: merged,
					telemetry: {
						provider,
						model,
						promptTokens: totalPromptTokens || undefined,
						completionTokens: totalCompletionTokens || undefined,
						latencyMs: totalLatency,
					},
				},
			)) as { resultId: Id<"analysisResults"> };

			return { status: "fertig", resultId };
		} catch (error) {
			await failRun(ctx, run._id, error);
			throw error;
		}
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

        const docPageIds = (await ctx.runQuery(
            internal.analysis.getDocPageIdsForProject,
            { projectId },
        )) as Id<"docPages">[];
        if (docPageIds.length === 0) {
            throw new ConvexError("Keine Dokumentseiten zum Analysieren gefunden.");
        }
        console.log("[analysis] runStandardForProject: pages=", docPageIds.length, "project=", projectId);

        // Acquire or promote a queued run
		const run = await acquireRun(ctx as any, project._id, identity.orgId, "standard", {
			userId: identity.userId,
		});

        const pages = await fetchDocPages(ctx as any, docPageIds, identity.orgId, project._id);
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
                orgId: identity.orgId,
                result: merged,
                telemetry: {
                    provider,
                    model,
                    promptTokens: totalPromptTokens || undefined,
                    completionTokens: totalCompletionTokens || undefined,
                    latencyMs: totalLatency,
                },
            })) as { resultId: Id<"analysisResults"> };

            console.log("[analysis] runStandardForProject: finished run=", run._id);
            return { status: "fertig", resultId };
        } catch (error) {
            await failRun(ctx as any, run._id, error);
            throw error;
        }
    },
});

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

		const pages = await fetchDocPages(ctx, args.docPageIds, identity.orgId, project._id);
		if (pages.length === 0) {
			throw new ConvexError("Keine Dokumentseiten zum Analysieren gefunden.");
		}

		const run = await acquireRun(ctx, project._id, identity.orgId, "criteria", {
			userId: identity.userId,
		});
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

			const { resultId } = (await ctx.runMutation(
				internal.analysis.recordCriteriaResult,
				{
					projectId: project._id,
					runId: run._id,
					orgId: identity.orgId,
					templateId: template._id,
					items: criteriaResults,
					telemetry: {
						provider,
						model,
						promptTokens: totalPromptTokens || undefined,
						completionTokens: totalCompletionTokens || undefined,
						latencyMs: totalLatency,
					},
				},
			)) as { resultId: Id<"analysisResults"> };

			return { status: "fertig", resultId };
		} catch (error) {
			await failRun(ctx, run._id, error);
			throw error;
		}
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

        const docPageIds = (await ctx.runQuery(
            internal.analysis.getDocPageIdsForProject,
            { projectId },
        )) as Id<"docPages">[];
        if (docPageIds.length === 0) {
            throw new ConvexError("Keine Dokumentseiten zum Analysieren gefunden.");
        }
        console.log("[analysis] runCriteriaForProject: pages=", docPageIds.length, "project=", projectId);

        // Acquire or promote a queued run
		const run = await acquireRun(ctx as any, project._id, identity.orgId, "criteria", {
			userId: identity.userId,
		});

        const pages = await fetchDocPages(ctx as any, docPageIds, identity.orgId, project._id);
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
                orgId: identity.orgId,
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

            console.log("[analysis] runCriteriaForProject: finished run=", run._id);
            return { status: "fertig", resultId };
        } catch (error) {
            await failRun(ctx as any, run._id, error);
            throw error;
        }
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
"milestones": [ // Eine Liste der wichtigsten Termine und Fristen des Projekts.
{
"title": string, // Der Name des Meilensteins (z.B. "Angebotsabgabe", "Projektstart").
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

		await ctx.runMutation(internal.analysis.activateNextQueuedRun, {
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

		await ctx.runMutation(internal.analysis.activateNextQueuedRun, {
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

		await ctx.runMutation(internal.analysis.activateNextQueuedRun, {
			orgId: run.orgId,
		});
	},
});

export const activateNextQueuedRun = internalMutation({
	args: {
		orgId: v.string(),
	},
	handler: async (ctx, { orgId }) => {
		const runs = await ctx.db
			.query("analysisRuns")
			.withIndex("by_orgId", (q) => q.eq("orgId", orgId))
			.collect();

		const hasActive = runs.some((run) => run.status === "läuft");
		if (hasActive) {
			return null;
		}

		const next = runs
			.filter((run) => run.status === "wartet")
			.sort((a, b) => a.queuedAt - b.queuedAt)[0];

		if (!next) {
			return null;
		}

		await ctx.db.patch(next._id, {
			status: "läuft",
			startedAt: Date.now(),
		});

		return next._id;
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
