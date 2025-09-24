import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { getIdentityOrThrow } from "./auth";
import { callLlm } from "./llm";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { ConvexError } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";

const PAGES_PER_CHUNK = 10;

const citationSchema = z.object({
	page: z.number(),
	quote: z.string().min(1),
});

const standardResultSchema = z.object({
	summary: z.string().min(1),
	milestones: z.array(
		z.object({
			title: z.string().min(1),
			date: z.string().optional(),
			citation: citationSchema.optional(),
		}),
	),
	requirements: z.array(
		z.object({
			title: z.string().min(1),
			category: z.string().optional(),
			notes: z.string().optional(),
			citation: citationSchema.optional(),
		}),
	),
	openQuestions: z.array(
		z.object({
			question: z.string().min(1),
			citation: citationSchema.optional(),
		}),
	),
	metadata: z.array(
		z.object({
			label: z.string().min(1),
			value: z.string().min(1),
			citation: citationSchema.optional(),
		}),
	),
});

const criteriaItemSchema = z.object({
	status: z.enum(["gefunden", "nicht_gefunden", "teilweise"]),
	comment: z.string().optional(),
	answer: z.string().optional(),
	citations: z.array(citationSchema).min(0),
	score: z.number().optional(),
});

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

		const run = await acquireRun(ctx, project._id, identity.orgId, "standard");
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

		const run = await acquireRun(ctx, project._id, identity.orgId, "criteria");
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
		if (latest.resultId) {
			const stored = await ctx.db.get(latest.resultId);
			if (stored && stored.orgId === identity.orgId) {
				result = args.type === "standard" ? stored.standard : stored.criteria;
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
	const systemPrompt =
		"Du bist ein deutschsprachiger Assistent für die Analyse von Ausschreibungsunterlagen. Antworte ausschliesslich auf Deutsch und nur auf Basis der bereitgestellten Seiten.";
	const userPrompt = `Lies die folgenden Seiten und extrahiere die Informationen gemäss dem JSON-Schema. Antworte strikt als JSON ohne zusätzlichen Text. Jede Aussage benötigt mindestens ein Zitat mit Seitenzahl.

${chunk.text}`;

	const { parsed, usage, latencyMs, provider, model } = await callLlmForJson({
		systemPrompt,
		userPrompt,
		maxOutputTokens: 1800,
	});

	const result = standardResultSchema.parse(parsed);

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
	const userPrompt = `Bewerte das folgende Kriterium anhand der bereitgestellten Dokumentseiten. Gib eine JSON-Antwort mit den Feldern status, comment, answer, score, citations (Liste von {\"page\", \"quote\"}). Status muss einer der Werte "gefunden", "nicht_gefunden" oder "teilweise" sein.

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

	const validated = criteriaItemSchema.extend({ citations: z.array(citationSchema).min(0) }).parse(parsed);

	return {
		result: validated,
		usage,
		latencyMs,
		meta: { provider, model },
	};
}

async function acquireRun(
	ctx: ActionCtx,
	projectId: Id<"projects">,
	orgId: string,
	type: "standard" | "criteria",
): Promise<Doc<"analysisRuns">> {
	return (await ctx.runMutation(internal.analysis.acquireRunForAction, {
		projectId,
		orgId,
		type,
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
	const openQuestions = dedupeByKey(
		results.flatMap((r) => r.openQuestions),
		(item) => item.question,
	);
	const metadata = dedupeByKey(results.flatMap((r) => r.metadata), (item) => item.label);

	return {
		summary,
		milestones,
		requirements,
		openQuestions,
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

export const acquireRunForAction = internalMutation({
	args: {
		projectId: v.id("projects"),
		orgId: v.string(),
		type: v.union(v.literal("standard"), v.literal("criteria")),
	},
	handler: async (ctx, { projectId, orgId, type }) => {
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
			throw new ConvexError("Keine aktive Analyse für dieses Projekt gefunden.");
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

		return { resultId };
	},
});

export const markRunFailed = internalMutation({
	args: {
		runId: v.id("analysisRuns"),
		error: v.string(),
	},
	handler: async (ctx, { runId, error }) => {
		await ctx.db.patch(runId, {
			status: "fehler",
			error,
			finishedAt: Date.now(),
		});
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
		const parsed = JSON.parse(primary.text);
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

		const parsed = JSON.parse(retry.text);
		return { parsed, usage, latencyMs, provider, model };
	}
}

function buildDocumentContext(pages: Array<{ page: number; text: string }>) {
	return pages
		.map((page) => `Seite ${page.page}:\n${page.text}`)
		.join("\n\n");
}
