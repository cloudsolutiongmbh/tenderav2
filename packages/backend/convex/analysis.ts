import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { getIdentityOrThrow } from "./auth";
import { callLlm } from "./llm";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { ConvexError } from "convex/values";
import type { RegisteredAction } from "convex/server";
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

const PAGES_PER_CHUNK = Number.parseInt(process.env.CONVEX_ANALYSIS_PAGES_PER_CHUNK ?? "80");
const MAX_PARALLEL_OFFER_JOBS = Math.max(
	1,
	Number.parseInt(process.env.CONVEX_MAX_PARALLEL_OFFER_JOBS ?? "3"),
);
const MAX_PARALLEL_OFFER_JOBS_PER_RUN = Math.min(
	MAX_PARALLEL_OFFER_JOBS,
	Math.max(
		1,
		Number.parseInt(
			process.env.CONVEX_MAX_PARALLEL_OFFER_JOBS_PER_RUN ?? "2",
		),
	),
);
const OFFER_JOB_TIMEOUT_MS = Math.max(
	30_000,
	Number.parseInt(process.env.CONVEX_OFFER_JOB_TIMEOUT_MS ?? "120000"),
);
const ANALYSIS_RUN_TIMEOUT_MS = Math.max(
	300_000,
	Number.parseInt(process.env.CONVEX_ANALYSIS_RUN_TIMEOUT_MS ?? "1800000"),
);
const OFFER_JOB_MAX_ATTEMPTS = Math.max(
	1,
	Number.parseInt(process.env.CONVEX_OFFER_JOB_MAX_ATTEMPTS ?? "3"),
);
const OFFER_PAGE_LIMIT = Math.max(
        1,
        Number.parseInt(process.env.CONVEX_OFFER_PAGE_LIMIT ?? "8"),
);
const OFFER_CHECK_PAGES_PER_CHUNK = Math.max(
	1,
	Number.parseInt(process.env.CONVEX_OFFER_CHECK_PAGES_PER_CHUNK ?? "20"),
);
const MAX_PROMPT_CHARS = Math.max(
	10_000,
	Number.parseInt(process.env.CONVEX_MAX_PROMPT_CHARS ?? "1200000"),
);
const MAX_PROMPT_TOKENS = Math.max(
	2_000,
	Number.parseInt(process.env.CONVEX_MAX_PROMPT_TOKENS ?? "200000"),
);
const CRITERIA_BATCH_SIZE = Math.max(
	1,
	Number.parseInt(process.env.CONVEX_CRITERIA_BATCH_SIZE ?? "3"),
);

const MAX_ACTIVE_RUNS_PER_ORG = Math.max(
	1,
	Number.parseInt(process.env.CONVEX_MAX_ACTIVE_RUNS_PER_ORG ?? "10"),
);

const MAX_ACTIVE_RUNS_PER_PROJECT = Math.max(
	1,
	Number.parseInt(process.env.CONVEX_MAX_ACTIVE_RUNS_PER_PROJECT ?? "1"),
);

function deduplicateCriteriaByKey<T extends { key: string }>(criteria: T[]): T[] {
        const seen = new Set<string>();
        const unique: T[] = [];

        for (const criterion of criteria) {
                const key = criterion.key.trim();
                if (seen.has(key)) {
                        continue;
                }
                seen.add(key);
                unique.push(criterion);
        }

        return unique;
}

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
	citations: Array<{
		documentId?: Id<"documents"> | string;
		documentKey?: string;
		documentName?: string;
		page: number;
		quote: string;
	}>;
}

interface OfferCriterionSnapshot {
	key: string;
	title: string;
	description: string | null;
	hints: string | null;
	required: boolean;
	weight: number;
	keywords: string[];
}

export const runStandard = action({
	args: {
		projectId: v.id("projects"),
		docPageIds: v.array(v.id("docPages")),
	},
	handler: async (ctx, args) => {
		const identity = await getIdentityOrThrow(ctx);
		const project = (await ctx.runQuery(internal.analysis.getProjectForAnalysis, {
			projectId: args.projectId,
		})) as Doc<"projects"> | null;
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

        await ctx.scheduler.runAfter(0, internal.analysis.kickQueue, {
            orgId: identity.orgId,
        });

        return { dispatched: true };
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

    const pages = await fetchDocPages(ctx, resolvedDocPageIds, orgId, project._id);
    if (pages.length === 0) {
        throw new ConvexError("Keine Dokumentseiten zum Analysieren gefunden.");
    }

    const run = await acquireRun(ctx, project._id, orgId, "standard", {
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

    const documentLookup = buildDocumentLookup(pages);
    const documentLegend = formatDocumentLegend(documentLookup);
    const chunks = chunkPages(pages, PAGES_PER_CHUNK, documentLookup);

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalLatency = 0;
    let provider = run.provider;
    let model = run.model;

    const partialResults: Array<z.infer<typeof standardResultSchema>> = [];

    try {
        for (const chunk of chunks) {
            const { result, usage, latencyMs, meta } = await analyseStandardChunk(
                chunk,
                documentLegend,
                documentLookup,
            );
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
        await failRun(ctx, run._id, error);
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

    const pages = await fetchDocPages(ctx, resolvedDocPageIds, orgId, project._id);
    if (pages.length === 0) {
        throw new ConvexError("Keine Dokumentseiten zum Analysieren gefunden.");
    }

    const run = await acquireRun(ctx, project._id, orgId, "criteria", {
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
		const documentLookup = buildDocumentLookup(pages);
		const documentLegend = formatDocumentLegend(documentLookup);
		const chunks = chunkPages(pages, PAGES_PER_CHUNK, documentLookup);
		const criteriaResults: CriterionComputation[] = [];

		for (const criterion of template.criteria) {
			const merged = await analyseCriterionAcrossChunks(
				criterion,
				chunks,
				documentLegend,
			);
			criteriaResults.push({
				key: criterion.key,
				title: criterion.title,
				description: criterion.description ?? undefined,
				hints: criterion.hints ?? undefined,
				answerType: criterion.answerType,
				weight: criterion.weight,
				required: criterion.required,
				keywords: criterion.keywords ?? undefined,
				status: merged.result.status,
				comment: merged.result.comment ?? undefined,
				answer: merged.result.answer ?? undefined,
				score: merged.result.score ?? undefined,
				citations: (merged.result.citations ?? []).map(
					(citation) =>
						normalizeCitationWithDocuments(citation, documentLookup) ?? citation,
				),
			});
			if (merged.usage.promptTokens) totalPromptTokens += merged.usage.promptTokens;
			if (merged.usage.completionTokens) {
				totalCompletionTokens += merged.usage.completionTokens;
			}
			totalLatency += merged.latencyMs;
			provider = merged.meta.provider;
			model = merged.meta.model;
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
        await failRun(ctx, run._id, error);
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

		if (!project || project.orgId !== identity.orgId) {
			throw new ConvexError("Projekt nicht gefunden.");
		}

		const template = (await ctx.runQuery(
			internal.analysis.getTemplateForAnalysis,
			{ templateId: args.templateId },
		)) as Doc<"templates"> | null;
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

        await ctx.scheduler.runAfter(0, internal.analysis.kickQueue, {
            orgId: identity.orgId,
        });

        return { dispatched: true };
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

		const latestRun = await ctx.db
			.query("analysisRuns")
			.withIndex("by_projectId_type", (q) =>
				q.eq("projectId", args.projectId).eq("type", args.type),
			)
			.order("desc")
			.first();

		if (!latestRun) {
			return { run: null, result: null };
		}

		const latestResult = await ctx.db
			.query("analysisResults")
			.withIndex("by_projectId_type", (q) =>
				q.eq("projectId", args.projectId).eq("type", args.type),
			)
			.order("desc")
			.first();

		let result: Doc<"analysisResults">["standard"] | Doc<"analysisResults">["criteria"] | null = null;
		if (latestResult && latestResult.orgId === identity.orgId) {
			if (args.type === "standard") {
				const standard = latestResult.standard as
					| (Record<string, unknown> & { openQuestions?: unknown })
					| undefined;
				if (standard && "openQuestions" in standard) {
					const { openQuestions: _deprecated, ...rest } = standard;
					result = rest as Doc<"analysisResults">["standard"];
				} else {
					result = latestResult.standard ?? null;
				}
			} else {
				result = latestResult.criteria ?? null;
			}
		}

		return {
			run: {
				_id: latestRun._id,
				status: latestRun.status,
				error: latestRun.error,
				queuedAt: latestRun.queuedAt,
				startedAt: latestRun.startedAt,
				finishedAt: latestRun.finishedAt,
				promptTokens: latestRun.promptTokens,
				completionTokens: latestRun.completionTokens,
				latencyMs: latestRun.latencyMs,
				provider: latestRun.provider,
				model: latestRun.model,
			},
			result,
		};
	},
});

export const getOfferCheckProgress = query({
	args: {
		offerId: v.id("offers"),
	},
	handler: async (ctx, { offerId }) => {
		const identity = await getIdentityOrThrow(ctx);
		const offer = await ctx.db.get(offerId);
		if (!offer || offer.orgId !== identity.orgId) {
			throw new ConvexError("Angebot nicht gefunden.");
		}

		if (!offer.latestRunId) {
			return { run: null };
		}

		const run = await ctx.db.get(offer.latestRunId);
		if (!run || run.type !== "offer_check" || run.orgId !== identity.orgId) {
			return { run: null };
		}

		const jobs = await ctx.db
			.query("offerCriterionJobs")
			.withIndex("by_run", (q) => q.eq("runId", run._id))
			.collect();

		let trackedProcessed = run.processedCount ?? 0;
		let trackedFailed = run.failedCount ?? 0;
		if (jobs.length > 0) {
			let derivedProcessed = 0;
			let derivedFailed = 0;
			for (const job of jobs) {
				if (job.status === "done") {
					derivedProcessed += 1;
				} else if (job.status === "error") {
					derivedFailed += 1;
				}
			}
			trackedProcessed = derivedProcessed;
			trackedFailed = derivedFailed;
		}

		const totalCount = Math.max(run.totalCount ?? 0, jobs.length);

		return {
			run: {
				_id: run._id,
				status: run.status,
				processedCount: trackedProcessed,
				failedCount: trackedFailed,
				totalCount,
				startedAt: run.startedAt ?? null,
				finishedAt: run.finishedAt ?? null,
			},
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

		const latest = await ctx.db
			.query("analysisRuns")
			.withIndex("by_projectId_type_createdAt", (q) =>
				q.eq("projectId", projectId).eq("type", "pflichtenheft_extract"),
			)
			.order("desc")
			.first();

		if (!latest) {
			return { run: null } as const;
		}

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
): Promise<
	Array<{
		_id: Id<"docPages">;
		page: number;
		text: string;
		documentId: Id<"documents">;
		documentName: string | null;
	}>
> {
	return (await ctx.runQuery(internal.analysis.getDocPagesByIds, {
		docPageIds: ids,
		orgId,
		projectId,
	})) as Array<{
		_id: Id<"docPages">;
		page: number;
		text: string;
		documentId: Id<"documents">;
		documentName: string | null;
	}>;
}

type DocumentMeta = {
	documentId: Id<"documents">;
	documentName: string;
	documentKey: string;
};

type DocumentLookup = {
	byId: Map<string, DocumentMeta>;
	byKey: Map<string, DocumentMeta>;
};

function toDocumentKey(index: number) {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
	if (index < alphabet.length) return alphabet[index];
	const prefix = Math.floor(index / alphabet.length) - 1;
	const suffix = index % alphabet.length;
	return `${alphabet[prefix]}${alphabet[suffix]}`;
}

function buildDocumentLookup(
	pages: Array<{ documentId: Id<"documents">; documentName: string | null }>,
): DocumentLookup {
	const byId = new Map<string, DocumentMeta>();
	const byKey = new Map<string, DocumentMeta>();

	for (const page of pages) {
		if (byId.has(page.documentId)) continue;
		const documentKey = toDocumentKey(byId.size);
		const meta: DocumentMeta = {
			documentId: page.documentId,
			documentName: page.documentName ?? "Unbenanntes Dokument",
			documentKey,
		};
		byId.set(page.documentId, meta);
		byKey.set(documentKey, meta);
	}

	return { byId, byKey };
}

function chunkPages(
	pages: Array<{
		page: number;
		text: string;
		documentId: Id<"documents">;
		documentName: string | null;
	}>,
	size: number,
	lookup: DocumentLookup,
) {
	const chunks: Array<{
		pages: Array<{
			page: number;
			text: string;
			documentId: Id<"documents">;
			documentName: string | null;
			documentKey: string;
		}>;
		text: string;
	}> = [];

	for (let i = 0; i < pages.length; i += size) {
		const subset = pages.slice(i, i + size).map((page) => {
			const meta = lookup.byId.get(page.documentId) ?? {
				documentKey: "?",
				documentName: page.documentName ?? "Unbenanntes Dokument",
				documentId: page.documentId,
			};
			return { ...page, documentKey: meta.documentKey };
		});

		const text = subset
			.map((page) => {
				const meta = lookup.byId.get(page.documentId);
				const name = meta?.documentName ?? "Unbenanntes Dokument";
				const key = meta?.documentKey ?? "?";
				return `Dokument ${key} (${name}) — Seite ${page.page}:\n${page.text}`;
			})
			.join("\n\n");

		chunks.push({ pages: subset, text });
	}

	return chunks;
}

function chunkPlainPages<T extends { page: number; text: string }>(pages: T[], size: number) {
	const chunks: T[][] = [];
	for (let i = 0; i < pages.length; i += size) {
		chunks.push(pages.slice(i, i + size));
	}
	return chunks;
}

function normalizeCitationWithDocuments(
	citation: z.infer<typeof citationSchema> | null | undefined,
	lookup: DocumentLookup,
) {
	if (!citation) return citation ?? null;

	const metaFromKey = citation.documentKey
		? lookup.byKey.get(citation.documentKey)
		: undefined;
	const metaFromId = citation.documentId
		? lookup.byId.get(citation.documentId)
		: undefined;
	const meta = metaFromKey ?? metaFromId;

	if (!meta) {
		return citation;
	}

	return {
		...citation,
		documentId: meta.documentId,
		documentKey: meta.documentKey,
		documentName: meta.documentName,
	};
}

function normalizeStandardResultWithDocuments(
	result: z.infer<typeof standardResultSchema>,
	lookup: DocumentLookup,
) {
	return {
		...result,
		milestones: result.milestones.map((item) => ({
			...item,
			citation: normalizeCitationWithDocuments(item.citation, lookup),
		})),
		requirements: result.requirements.map((item) => ({
			...item,
			citation: normalizeCitationWithDocuments(item.citation, lookup),
		})),
		metadata: result.metadata.map((item) => ({
			...item,
			citation: normalizeCitationWithDocuments(item.citation, lookup),
		})),
	};
}

function normalizeCriteriaResultWithDocuments(
	items: CriterionComputation[],
	lookup: DocumentLookup,
): CriterionComputation[] {
	return items.map((item) => ({
		...item,
		citations: (item.citations ?? []).map((citation) =>
			normalizeCitationWithDocuments(citation, lookup) ?? citation,
		),
	}));
}

function formatDocumentLegend(lookup: DocumentLookup) {
	const entries = Array.from(lookup.byKey.values()).sort((a, b) =>
		a.documentKey.localeCompare(b.documentKey),
	);
	return entries
		.map((entry) => `- Dokument ${entry.documentKey}: ${entry.documentName}`)
		.join("\n");
}

function selectOfferPagesForCriterion(
	pages: Array<{ page: number; text: string }>,
	criterion: OfferCriterionSnapshot,
) {
	const tokens = new Set<string>();
	const pushTokens = (value: string | null) => {
		if (!value) return;
		const matches = value.toLowerCase().match(/[a-zäöüß0-9]+/g);
		if (!matches) return;
		for (const token of matches) {
			if (token.length > 1) {
				tokens.add(token);
			}
		}
	};

	pushTokens(criterion.title);
	pushTokens(criterion.description);
	pushTokens(criterion.hints);
	for (const keyword of criterion.keywords) {
		pushTokens(keyword);
	}

	if (tokens.size === 0) {
		return [...pages];
	}

	const scored = pages.map((page) => {
		const lower = page.text.toLowerCase();
		let score = 0;
		for (const token of tokens) {
			const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const matches = lower.match(new RegExp(escapedToken, "g"));
			if (matches) {
				score += matches.length;
			}
		}
		return { page, score };
	});

	const preferred = scored
		.filter((entry) => entry.score > 0)
		.sort((a, b) => {
			if (b.score === a.score) {
				return a.page.page - b.page.page;
			}
			return b.score - a.score;
		})
		.slice(0, OFFER_PAGE_LIMIT)
		.map((entry) => entry.page);

	if (preferred.length === 0) {
		return [...pages];
	}

	const preferredPages = new Set(preferred.map((entry) => entry.page));
	const remainder = pages
		.filter((page) => !preferredPages.has(page.page))
		.sort((a, b) => a.page - b.page);

	return [...preferred, ...remainder];
}

async function analyseStandardChunk(
	chunk: {
		pages: Array<{
			page: number;
			text: string;
			documentId: Id<"documents">;
			documentName: string | null;
			documentKey: string;
		}>;
		text: string;
	},
	documentLegend: string,
	lookup: DocumentLookup,
) {
	const systemPrompt = `Developer message
Du bist ein deutscher KI-Assistent zur strukturierten Analyse von Ausschreibungsunterlagen und Pflichtenheften. Deine einzige Aufgabe ist es, basierend ausschließlich auf den gelieferten Dokumentseiten genau EIN valides JSON-Objekt gemäß der beschriebenen Struktur auszugeben.
<code_editing_rules>
<guiding_principles>
- **Business-Fokus**: Priorisiere Informationen, die für Geschäftsentscheidungen relevant sind: Projektumfang, kommerzielle Bedingungen, Vertragsanforderungen, kritische Termine, Qualifikationsanforderungen. Operative Details (z.B. Sicherheitsvorschriften auf Baustellen, Arbeitskleidung) sind nachrangig.
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
- Verwende immer den passenden Dokument-Schlüssel (\`documentKey\`), wie in der Dokumentenliste angegeben, damit klar ist, aus welchem Dokument eine Seite stammt.
Arbeite exakt, beachte die Zitierregeln und gib **ausschließlich** das finale JSON-Objekt zurück.
Nach Fertigstellung prüfe die vollständige Korrektheit und Gültigkeit des ausgegebenen JSON-Objekts. Bei Fehlern sind diese intern zu beheben, sodass nur ein valides, finales JSON zurückgegeben wird.
Abbruchbedingung:
- Kein zusätzlicher Text oder Erklärungsausgabe.
- Keine Erklärungen.
- Die Syntax des JSON muss vollständig korrekt und valide sein.
## Output Format
Das auszugebende JSON-Objekt sieht wie folgt aus:
{
"summary": string | null, // Executive Summary für Entscheidungsträger in 3-5 Sätzen. Fokussiere auf: (1) Projektgegenstand und Leistungsumfang, (2) Auftraggeber und Vergabeart, (3) Wichtigste Fristen (Abgabe, Zuschlag, Projektstart), (4) Kommerzielle oder vertragliche Besonderheiten. IGNORIERE operative Details wie Sicherheitsvorschriften, Arbeitskleidung oder Verhaltensregeln auf der Baustelle.
"milestones": [ // Eine Liste der wichtigsten projektbezogenen Termine und Fristen. WICHTIG: Extrahiere NUR Termine, die sich auf das Projekt selbst beziehen (z.B. Angebotsabgabe, Projektstart, Abgabefrist, Inbetriebnahme, Abnahme, wichtige Projektphasen). IGNORIERE Dokument-Metadaten wie "Dokument erstellt", "Dokument Version", "Erstellt am" oder ähnliche administrative Datumsangaben.
{
"title": string, // Der Name des Meilensteins (z.B. "Angebotsabgabe", "Projektstart", "Inbetriebnahme"). NIEMALS "Dokument erstellt" oder "Dokument Version".
"date": string | null, // Das Datum des Meilensteins im Format "YYYY-MM-DD". Wenn nur ein Monat oder Jahr angegeben ist, verwende das Format "YYYY-MM" oder "YYYY".
"citation": { "documentKey": string, "page": number, "quote": string } | null
}
],
"requirements": [ // Eine Liste der wichtigsten funktionalen und nicht-funktionalen Anforderungen an das Projekt.
{
  "title": string, // Eine kurze, prägnante Beschreibung der Anforderung.
  "category": string | null, // Eine Kategorie für die Anforderung (z.B. "Technisch", "Rechtlich", "Organisatorisch").
  "notes": string | null, // Zusätzliche Anmerkungen oder Details zur Anforderung.
  "citation": { "documentKey": string, "page": number, "quote": string } | null
}
],
"metadata": [ // Eine Liste von Metadaten zum Projekt, wie z.B. Ansprechpartner, Auftraggeber, etc.
{
"label": string, // Die Bezeichnung des Metadatums (z.B. "Auftraggeber", "Ansprechpartner").
"value": string, // Der Wert des Metadatums.
"citation": { "documentKey": string, "page": number, "quote": string } | null
}
]
}
Hinweise:
- Alle Felder sind immer im Output enthalten. Falls keine passenden Inhalte vorliegen, ist das jeweilige Feld bzw. Objekt mit \`null\` zu belegen.
- Arrays wie milestones, requirements und metadata können leer sein ([]), sind aber immer mit auszugeben.
- Nicht eindeutig belegbare Inhalte sind wegzulassen oder mit \`null\` zu kennzeichnen.
- Bei unvollständigem oder fehlendem Kontext sind alle Felder gemäß oben zu behandeln und keine Fehlerhinweise oder Meldungen auszugeben.`;

    const cappedText = limitPromptText(chunk.text, MAX_PROMPT_CHARS, MAX_PROMPT_TOKENS);
    const userPrompt = `Lies die folgenden Seiten und liefere genau EIN valides JSON-Objekt (kein Array, keine Erklärungen, keine Kommentare, kein Fließtext).

Dokumente in diesem Chunk:
${documentLegend}

Seiten:
${cappedText}`;

    const { parsed, usage, latencyMs, provider, model } = await callLlmForJson({
        systemPrompt,
        userPrompt,
        maxOutputTokens: 1800,
    });

    const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
    const result = standardResultSchema.parse(candidate);

    const enriched = normalizeStandardResultWithDocuments(result, lookup);

	return {
		result: enriched,
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
	const cappedContext = limitPromptText(documentContext, MAX_PROMPT_CHARS, MAX_PROMPT_TOKENS);
	const userPrompt = `Bewerte das folgende Kriterium anhand der bereitgestellten Dokumentseiten. Liefere GENAU EIN JSON-OBJEKT (kein Array, keine Erklärungen, kein Markdown) mit folgender Struktur:

{\n  \"status\": \"gefunden\" | \"nicht_gefunden\" | \"teilweise\",\n  \"comment\": string | null,\n  \"answer\": string | null,\n  \"score\": number | null,\n  \"citations\": [ { \"documentKey\": string, \"page\": number, \"quote\": string } ]\n}

Regeln:
- Gib ausschliesslich dieses JSON-Objekt zurück (kein Array, kein Fliesstext, keine Codeblöcke).
- Jede Aussage benötigt mindestens ein Zitat in \"citations\" (documentKey + page + quote).
- Fehlende Werte als null eintragen.
- Antwort immer als String liefern; bei boolean-Antworten verwende \"Ja\" oder \"Nein\".
- Nutze den Dokument-Schlüssel (documentKey) aus der Dokumentliste, damit klar ist, aus welchem Dokument die Seite stammt.

Kriterium:
Titel: ${criterion.title}
Beschreibung: ${criterion.description ?? "-"}
Hinweise: ${criterion.hints ?? "-"}
Antworttyp: ${criterion.answerType}
Gewicht: ${criterion.weight}
Pflicht: ${criterion.required ? "ja" : "nein"}
Schlüsselwörter: ${(criterion.keywords ?? []).join(", ") || "-"}

Dokumentseiten:
${cappedContext}`;

    const { parsed, usage, latencyMs, provider, model } = await callLlmForJson({
        systemPrompt,
        userPrompt,
        maxOutputTokens: 800,
    });

    const c = Array.isArray(parsed) ? parsed[0] : parsed;
    const normalized = normalizeCriteriaItem(c, criterion.answerType);
    const validated = criteriaItemSchema.parse(normalized);

	return {
		result: validated,
		usage,
		latencyMs,
		meta: { provider, model },
	};
}

function normalizeCriteriaItem(
	value: unknown,
	answerType: "boolean" | "skala" | "text",
): Record<string, unknown> {
	const item =
		typeof value === "object" && value !== null
			? { ...(value as Record<string, unknown>) }
			: {};

	if ("answer" in item) {
		const answer = item.answer;
		if (answer === null || answer === undefined) {
			// keep null/undefined
		} else if (typeof answer === "boolean") {
			item.answer =
				answerType === "boolean" ? (answer ? "Ja" : "Nein") : String(answer);
		} else if (typeof answer === "number") {
			item.answer = Number.isFinite(answer) ? String(answer) : null;
		} else if (typeof answer !== "string") {
			try {
				item.answer = JSON.stringify(answer);
			} catch {
				item.answer = String(answer);
			}
		}
	}

	if ("comment" in item) {
		const comment = item.comment;
		if (comment === null || comment === undefined) {
			// keep null/undefined
		} else if (typeof comment !== "string") {
			item.comment = String(comment);
		}
	}

	if ("score" in item) {
		const score = item.score;
		if (score === null || score === undefined) {
			// keep null/undefined
		} else if (typeof score === "string") {
			const parsedScore = Number(score);
			item.score = Number.isFinite(parsedScore) ? parsedScore : null;
		} else if (typeof score !== "number") {
			item.score = null;
		}
	}

	if (!Array.isArray(item.citations)) {
		item.citations = [];
	}

	return item;
}

async function analyseCriterionAcrossChunks(
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
	chunks: Array<{ text: string }>,
	documentLegend: string,
) {
	const mergedUsage: {
		promptTokens?: number;
		completionTokens?: number;
	} = {};
	let totalLatency = 0;
	let lastMeta = { provider: "PENDING", model: "PENDING" } as {
		provider: string;
		model: string;
	};
	const results: Array<z.infer<typeof criteriaItemSchema>> = [];

	for (const chunk of chunks) {
		const context = limitPromptText(
			`${documentLegend}\n\n${chunk.text}`,
			MAX_PROMPT_CHARS,
			MAX_PROMPT_TOKENS,
		);
		const { result, usage, latencyMs, meta } = await analyseCriterion(
			criterion,
			context,
		);
		results.push(result);
		if (usage.promptTokens) {
			mergedUsage.promptTokens = (mergedUsage.promptTokens ?? 0) + usage.promptTokens;
		}
		if (usage.completionTokens) {
			mergedUsage.completionTokens =
				(mergedUsage.completionTokens ?? 0) + usage.completionTokens;
		}
		totalLatency += latencyMs;
		lastMeta = meta;

		if (result.status === "gefunden" && (result.citations ?? []).length > 0) {
			break;
		}
	}

	const mergedResult = mergeCriterionResults(results);

	return {
		result: mergedResult,
		usage: mergedUsage,
		latencyMs: totalLatency,
		meta: lastMeta,
	};
}

function mergeCriterionResults(results: Array<z.infer<typeof criteriaItemSchema>>) {
	const precedence: Array<z.infer<typeof criteriaItemSchema>["status"]> = [
		"gefunden",
		"teilweise",
		"nicht_gefunden",
	];
	const bestStatus =
		precedence.find((status) => results.some((result) => result.status === status)) ??
		"nicht_gefunden";
	const statusCandidates = results.filter((result) => result.status === bestStatus);
	const bestResult =
		statusCandidates.find((result) => (result.citations ?? []).length > 0) ??
		statusCandidates.find((result) => typeof result.answer === "string" && result.answer.length > 0) ??
		statusCandidates[0] ??
		results[0];
	const bestScore = statusCandidates
		.map((result) => result.score)
		.filter((score): score is number => typeof score === "number")
		.sort((a, b) => b - a)[0];
	const citations = statusCandidates.flatMap((result) => result.citations ?? []);

	return {
		status: bestStatus,
		comment:
			typeof bestResult?.comment === "string" && bestResult.comment.length > 0
				? bestResult.comment
				: null,
		answer:
			typeof bestResult?.answer === "string" && bestResult.answer.length > 0
				? bestResult.answer
				: null,
		score: bestScore ?? null,
		citations,
	};
}

function mergePflichtenheftResults(
	results: Array<z.infer<typeof pflichtenheftExtractionSchema>>,
) {
	type PflichtenheftCriterion =
		z.infer<typeof pflichtenheftExtractionSchema>["mussCriteria"][number];
	const mussByKey = new Map<string, PflichtenheftCriterion>();
	const kannByKey = new Map<string, PflichtenheftCriterion>();

	const addItem = (
		map: Map<string, PflichtenheftCriterion>,
		item: PflichtenheftCriterion,
	) => {
		const key = `${item.title.trim().toLowerCase()}::${(item.description ?? "")
			.trim()
			.toLowerCase()}`;
		const existing = map.get(key);
		if (!existing) {
			map.set(key, { ...item, pages: Array.from(new Set(item.pages)) });
			return;
		}
		const mergedPages = new Set([...existing.pages, ...item.pages]);
		map.set(key, {
			...existing,
			description: existing.description ?? item.description ?? null,
			hints: existing.hints ?? item.hints ?? null,
			pages: Array.from(mergedPages).sort((a, b) => a - b),
		});
	};

	for (const result of results) {
		for (const item of result.mussCriteria ?? []) {
			addItem(mussByKey, item);
		}
		for (const item of result.kannCriteria ?? []) {
			addItem(kannByKey, item);
		}
	}

	return {
		mussCriteria: Array.from(mussByKey.values()),
		kannCriteria: Array.from(kannByKey.values()),
	};
}

function mergeOfferCheckResults(results: Array<z.infer<typeof offerCheckResultSchema>>) {
	const precedence: Array<z.infer<typeof offerCheckResultSchema>["status"]> = [
		"erfuellt",
		"teilweise",
		"unklar",
		"nicht_erfuellt",
	];

	const bestByConfidence = results
		.filter((result) => typeof result.confidence === "number")
		.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
	const bestByStatus =
		results
			.map((result) => result.status)
			.sort((a, b) => precedence.indexOf(a) - precedence.indexOf(b))[0] ??
		"unklar";

	const bestResult =
		bestByConfidence ??
		results.find((result) => result.status === bestByStatus) ??
		results[0];

	return {
		status: bestResult?.status ?? "unklar",
		comment: bestResult?.comment ?? null,
		citations: bestResult?.citations ?? [],
		confidence: bestResult?.confidence ?? null,
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
        const summaryParts = results
                .map((result) => result.summary)
                .filter((summary): summary is string => typeof summary === "string" && summary.length > 0);
        const summary = summaryParts.length > 0 ? summaryParts.join("\n\n") : null;

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
		const pages: Array<{
			_id: Id<"docPages">;
			page: number;
			text: string;
			documentId: Id<"documents">;
			documentName: string | null;
		}> = [];
		for (const id of docPageIds) {
			const page = await ctx.db.get(id);
			if (!page || page.orgId !== orgId) {
				throw new ConvexError("Dokumentseite nicht gefunden oder ohne Berechtigung.");
			}
			const document = await ctx.db.get(page.documentId);
			if (!document || document.projectId !== projectId || document.orgId !== orgId) {
				throw new ConvexError("Dokumentseite gehört nicht zum Projekt.");
			}
			pages.push({
				_id: page._id,
				page: page.page,
				text: page.text,
				documentId: page.documentId,
				documentName: document.filename ?? null,
			});
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
		const ids: Id<"docPages">[] = [];
		for (const doc of documents) {
			const pages = await ctx.db
				.query("docPages")
				.withIndex("by_documentId", (q) => q.eq("documentId", doc._id))
				.collect();
			for (const page of pages) ids.push(page._id);
		}
		return ids;
	},
});

export const getPflichtenheftDocPageIdsForProject = internalQuery({
	args: {
		projectId: v.id("projects"),
		orgId: v.string(),
	},
	handler: async (ctx, { projectId, orgId }) => {
		const documents = await ctx.db
			.query("documents")
			.withIndex("by_projectId_role", (q) =>
				q.eq("projectId", projectId).eq("role", "pflichtenheft"),
			)
			.filter((q) => q.eq(q.field("orgId"), orgId))
			.collect();

		const ids: Id<"docPages">[] = [];
		for (const doc of documents) {
			const pages = await ctx.db
				.query("docPages")
				.withIndex("by_documentId", (q) => q.eq("documentId", doc._id))
				.filter((q) => q.eq(q.field("orgId"), orgId))
				.collect();
			for (const page of pages) ids.push(page._id);
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
			});
			const updated = await ctx.db.get(current._id);
			if (!updated) {
				throw new ConvexError("Analyse konnte nicht gestartet werden.");
			}
			return updated;
		}

		if (current.status === "läuft") {
			return current;
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
						documentKey: v.optional(v.string()),
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
					comment: item.comment ?? undefined,
					answer: item.answer ?? undefined,
					score: item.score ?? undefined,
					weight: item.weight,
					citations: item.citations.map((citation) => ({
						documentKey: citation.documentKey ?? undefined,
						page: citation.page,
						quote: citation.quote,
					})),
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

export const ensureCriteriaResult = internalMutation({
	args: {
		projectId: v.id("projects"),
		runId: v.id("analysisRuns"),
		orgId: v.string(),
		templateId: v.id("templates"),
		totalCount: v.number(),
	},
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		if (!run || run.orgId !== args.orgId) {
			throw new ConvexError("Analyse nicht gefunden.");
		}

		if (run.resultId) {
			return { resultId: run.resultId };
		}

		const now = Date.now();
		const resultId = await ctx.db.insert("analysisResults", {
			projectId: args.projectId,
			runId: args.runId,
			type: "criteria",
			criteria: {
				templateId: args.templateId,
				summary: undefined,
				items: [],
			},
			standard: undefined,
			orgId: args.orgId,
			createdAt: now,
		});

		await ctx.db.patch(args.runId, {
			resultId,
			templateSnapshotId: run.templateSnapshotId ?? args.templateId,
			totalCount: args.totalCount,
			processedCount: run.processedCount ?? 0,
			failedCount: run.failedCount ?? 0,
		});

		return { resultId };
	},
});

export const appendCriteriaBatch = internalMutation({
	args: {
		runId: v.id("analysisRuns"),
		orgId: v.string(),
		resultId: v.id("analysisResults"),
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
						documentKey: v.optional(v.string()),
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
		processedCount: v.number(),
	},
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		if (!run || run.orgId !== args.orgId) {
			throw new ConvexError("Analyse nicht gefunden.");
		}

		const result = await ctx.db.get(args.resultId);
		if (!result || result.orgId !== args.orgId || result.type !== "criteria") {
			throw new ConvexError("Analyse-Ergebnis nicht gefunden.");
		}

		const existing = result.criteria?.items ?? [];
		const appended = existing.concat(
			args.items.map((item) => ({
				criterionId: item.key,
				title: item.title,
				status: item.status,
				comment: item.comment ?? undefined,
				answer: item.answer ?? undefined,
				score: item.score ?? undefined,
				weight: item.weight,
				citations: item.citations.map((citation) => ({
					documentKey: citation.documentKey ?? undefined,
					page: citation.page,
					quote: citation.quote,
				})),
			})),
		);

		await ctx.db.patch(args.resultId, {
			criteria: {
				templateId: result.criteria?.templateId,
				summary: result.criteria?.summary,
				items: appended,
			},
		});

		const nextProcessed = (run.processedCount ?? 0) + args.processedCount;
		await ctx.db.patch(args.runId, {
			processedCount: nextProcessed,
			promptTokens:
				(run.promptTokens ?? 0) + (args.telemetry.promptTokens ?? 0),
			completionTokens:
				(run.completionTokens ?? 0) + (args.telemetry.completionTokens ?? 0),
			latencyMs: (run.latencyMs ?? 0) + args.telemetry.latencyMs,
			provider: args.telemetry.provider,
			model: args.telemetry.model,
		});

		return { processedCount: nextProcessed, totalCount: run.totalCount };
	},
});

export const completeCriteriaRun = internalMutation({
	args: {
		runId: v.id("analysisRuns"),
		orgId: v.string(),
		resultId: v.id("analysisResults"),
	},
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		if (!run || run.orgId !== args.orgId) {
			throw new ConvexError("Analyse nicht gefunden.");
		}

		const now = Date.now();
		await ctx.db.patch(args.runId, {
			status: "fertig",
			finishedAt: now,
			resultId: args.resultId,
			error: undefined,
		});

		await ctx.scheduler.runAfter(0, internal.analysis.kickQueue, {
			orgId: args.orgId,
		});

		return { resultId: args.resultId };
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
            await executeStandardAnalysis(ctx, {
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
			const resultId = (await ctx.runMutation(
				internal.analysis.ensureCriteriaResult,
				{
					projectId: project._id,
					runId: run._id,
					orgId: run.orgId,
					templateId: template._id,
					totalCount: template.criteria.length,
				},
			)) as { resultId: Id<"analysisResults"> };

			const pages = await fetchDocPages(
				ctx,
				await ctx.runQuery(internal.analysis.getDocPageIdsForProject, {
					projectId: project._id,
				}) as Id<"docPages">[],
				run.orgId,
				project._id,
			);
			if (pages.length === 0) {
				throw new ConvexError("Keine Dokumentseiten zum Analysieren gefunden.");
			}

			const documentLookup = buildDocumentLookup(pages);
			const documentLegend = formatDocumentLegend(documentLookup);
			const chunks = chunkPages(pages, PAGES_PER_CHUNK, documentLookup);

			const startIndex = run.processedCount ?? 0;
			const batch = template.criteria.slice(startIndex, startIndex + CRITERIA_BATCH_SIZE);
			if (batch.length === 0) {
				await ctx.runMutation(internal.analysis.completeCriteriaRun, {
					runId: run._id,
					orgId: run.orgId,
					resultId: resultId.resultId,
				});
				return;
			}

			let batchPromptTokens = 0;
			let batchCompletionTokens = 0;
			let batchLatencyMs = 0;
			let provider = run.provider;
			let model = run.model;
			const criteriaResults: CriterionComputation[] = [];

			for (const criterion of batch) {
				const merged = await analyseCriterionAcrossChunks(
					criterion,
					chunks,
					documentLegend,
				);
				criteriaResults.push({
					key: criterion.key,
					title: criterion.title,
					description: criterion.description ?? undefined,
					hints: criterion.hints ?? undefined,
					answerType: criterion.answerType,
					weight: criterion.weight,
					required: criterion.required,
					keywords: criterion.keywords ?? undefined,
					status: merged.result.status,
					comment: merged.result.comment ?? undefined,
					answer: merged.result.answer ?? undefined,
					score: merged.result.score ?? undefined,
					citations: (merged.result.citations ?? []).map(
						(citation) =>
							normalizeCitationWithDocuments(citation, documentLookup) ?? citation,
					),
				});
				if (merged.usage.promptTokens) batchPromptTokens += merged.usage.promptTokens;
				if (merged.usage.completionTokens) {
					batchCompletionTokens += merged.usage.completionTokens;
				}
				batchLatencyMs += merged.latencyMs;
				provider = merged.meta.provider;
				model = merged.meta.model;
			}

			const updated = (await ctx.runMutation(
				internal.analysis.appendCriteriaBatch,
				{
					runId: run._id,
					orgId: run.orgId,
					resultId: resultId.resultId,
					items: criteriaResults,
					telemetry: {
						provider,
						model,
						promptTokens: batchPromptTokens || undefined,
						completionTokens: batchCompletionTokens || undefined,
						latencyMs: batchLatencyMs,
					},
					processedCount: batch.length,
				},
			)) as { processedCount: number; totalCount?: number };

			const totalCount = updated.totalCount ?? template.criteria.length;
			if (updated.processedCount >= totalCount) {
				await ctx.runMutation(internal.analysis.completeCriteriaRun, {
					runId: run._id,
					orgId: run.orgId,
					resultId: resultId.resultId,
				});
				return;
			}

			await ctx.scheduler.runAfter(0, internal.analysis.runCriteriaQueueWorker, {
				runId: run._id,
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

export const runOfferCriterionWorker = internalAction({
    args: {
        runId: v.id("analysisRuns"),
    },
    handler: async (ctx, { runId }) => {
        const run = (await ctx.runQuery(internal.analysis.getRunForAnalysis, {
            runId,
        })) as Doc<"analysisRuns"> | null;

        if (!run || run.type !== "offer_check") {
            return;
        }
        if (run.status !== "läuft") {
            return;
        }

        const { jobId } = (await ctx.runMutation(internal.analysis.claimOfferCriterionJob, {
            runId,
        })) as { jobId: Id<"offerCriterionJobs"> | null };

        if (!jobId) {
            const totalCount = run.totalCount ?? 0;
            const processed = run.processedCount ?? 0;
            const failed = run.failedCount ?? 0;
            if (totalCount > 0 && processed + failed >= totalCount) {
                const summary = await ctx.runQuery(internal.analysis.getOfferRunErrorSummary, {
                    runId,
                });
                await ctx.runMutation(internal.analysis.completeOfferCheckRun, {
                    runId,
                    status: summary.hasFailures ? "fehler" : "fertig",
                    errorMessage: summary.message,
                });
            }
            return;
        }

        const job = (await ctx.runQuery(internal.analysis.getOfferCriterionJob, {
            jobId,
        })) as Doc<"offerCriterionJobs"> | null;

        if (!job) {
            return;
        }

        const offer = (await ctx.runQuery(internal.analysis.getOfferForAnalysis, {
            offerId: job.offerId,
        })) as Doc<"offers"> | null;

        if (!offer || offer.orgId !== run.orgId) {
            await ctx.runMutation(internal.analysis.markOfferJobFailed, {
                jobId,
                errorCode: "OFFER_NOT_FOUND",
                errorMessage: "Angebot nicht gefunden oder ohne Berechtigung.",
            });
            await ctx.runMutation(internal.analysis.completeOfferCheckRun, {
                runId,
                status: "fehler",
                errorMessage: "Angebot konnte nicht geladen werden.",
            });
            return;
        }

        if (!offer.documentId) {
            await ctx.runMutation(internal.analysis.markOfferJobFailed, {
                jobId,
                errorCode: "NO_DOCUMENT",
                errorMessage: "Kein Dokument für dieses Angebot vorhanden.",
            });
            const summary = await ctx.runQuery(internal.analysis.getOfferRunErrorSummary, {
                runId,
            });
            await ctx.runMutation(internal.analysis.completeOfferCheckRun, {
                runId,
                status: "fehler",
                errorMessage: summary.message ?? "Kein Angebotsdokument vorhanden.",
            });
            return;
        }

        try {
            const docPageIds = (await ctx.runQuery(
                internal.analysis.getDocPageIdsForDocument,
                { documentId: offer.documentId },
            )) as Id<"docPages">[];

            const pages = await fetchDocPages(
                ctx,
                docPageIds,
                run.orgId,
                job.projectId as Id<"projects">,
            );

            const orderedPages = selectOfferPagesForCriterion(pages, {
                key: job.criterionKey,
                title: job.criterionTitle,
                description: job.criterionDescription ?? null,
                hints: job.criterionHints ?? null,
                required: job.required,
                weight: job.weight,
                keywords: job.keywords ?? [],
            }).slice(0, OFFER_PAGE_LIMIT);

            const { result, usage, latencyMs, meta } = await checkOfferCriterion(
                orderedPages,
                {
                    key: job.criterionKey,
                    title: job.criterionTitle,
                    description: job.criterionDescription ?? undefined,
                    hints: job.criterionHints ?? undefined,
                    required: job.required,
                },
            );

            await ctx.runMutation(internal.analysis.upsertOfferCriterionResult, {
                projectId: job.projectId,
                offerId: job.offerId,
                runId,
                criterionKey: job.criterionKey,
                criterionTitle: job.criterionTitle,
                required: job.required,
                weight: job.weight,
                status: result.status,
                comment: result.comment ?? undefined,
                citations: result.citations,
                confidence: result.confidence ?? undefined,
                provider: meta.provider,
                model: meta.model,
                orgId: run.orgId,
            });

            const status = await ctx.runMutation(internal.analysis.markOfferJobDone, {
                jobId,
                usage,
                latencyMs,
                provider: meta.provider,
                model: meta.model,
            });

            if (status.runId && status.isComplete) {
                const summary = await ctx.runQuery(internal.analysis.getOfferRunErrorSummary, {
                    runId,
                });
                await ctx.runMutation(internal.analysis.completeOfferCheckRun, {
                    runId,
                    status: summary.hasFailures ? "fehler" : "fertig",
                    errorMessage: summary.message,
                });
            }

            await ctx.scheduler.runAfter(0, internal.analysis.kickQueue, { orgId: run.orgId });
        } catch (error) {
            console.error("[analysis] runOfferCriterionWorker failed", {
                runId,
                jobId,
                error,
            });

            const currentJob = (await ctx.runQuery(internal.analysis.getOfferCriterionJob, {
                jobId,
            })) as Doc<"offerCriterionJobs"> | null;

            if (!currentJob) {
                return;
            }

            const attempts = currentJob.attempts;
            if (attempts < OFFER_JOB_MAX_ATTEMPTS) {
                const baseDelay = 5000 * Math.pow(2, attempts);
                const jitter = Math.floor(Math.random() * 1000);
                const delay = baseDelay + jitter;
                await ctx.runMutation(internal.analysis.resetOfferJobToPending, {
                    jobId,
                    retryAfter: Date.now() + delay,
                });
                await ctx.scheduler.runAfter(delay, internal.analysis.runOfferCriterionWorker, {
                    runId,
                });
            } else {
                const result = await ctx.runMutation(internal.analysis.markOfferJobFailed, {
                    jobId,
                    errorCode: "JOB_FAILED",
                    errorMessage:
                        error instanceof Error ? error.message : "Angebotsprüfung fehlgeschlagen.",
                });

                if (result.runId && result.isComplete) {
                    const summary = await ctx.runQuery(internal.analysis.getOfferRunErrorSummary, {
                        runId,
                    });
                    await ctx.runMutation(internal.analysis.completeOfferCheckRun, {
                        runId,
                        status: "fehler",
                        errorMessage: summary.message,
                    });
                }
            }

            await ctx.scheduler.runAfter(0, internal.analysis.kickQueue, { orgId: run.orgId });
        }
    },
});

export const kickQueue = internalAction({
	args: {
		orgId: v.string(),
	},
	handler: async (ctx, { orgId }) => {
		await ctx.scheduler.runAfter(0, internal.analysis.cleanStaleRuns, {
			orgId,
			timeoutMs: ANALYSIS_RUN_TIMEOUT_MS,
		});
		await ctx.scheduler.runAfter(
			Math.floor(ANALYSIS_RUN_TIMEOUT_MS / 2),
			internal.analysis.cleanStaleRuns,
			{
				orgId,
				timeoutMs: ANALYSIS_RUN_TIMEOUT_MS,
			},
		);

			const runs = (await ctx.runQuery(internal.analysis.listRunsByOrg, {
				orgId,
			})) as Doc<"analysisRuns">[];
		if (runs.length === 0) {
			return;
		}

        const offerRuns = runs.filter((run) => run.type === "offer_check");
        const otherRuns = runs.filter((run) => run.type !== "offer_check");

        if (offerRuns.length > 0) {
            const { pending, processing } = await ctx.runQuery(
                internal.analysis.countOfferJobsForOrg,
                { orgId },
            );
            if (pending > 0) {
                const available = Math.max(0, MAX_PARALLEL_OFFER_JOBS - processing);
                if (available > 0) {
                    const runIds = await ctx.runQuery(
                        internal.analysis.listOfferRunsWithPendingJobs,
                        { orgId, limit: Math.max(1, available) },
                    );
                    if (runIds.length > 0) {
                        const perRunLimit = Math.min(
                            MAX_PARALLEL_OFFER_JOBS_PER_RUN,
                            available,
                        );
                        let remaining = available;
                        for (let round = 0; round < perRunLimit && remaining > 0; round++) {
                            for (const runId of runIds) {
                                if (remaining <= 0) {
                                    break;
                                }
                                await ctx.scheduler.runAfter(
                                    0,
                                    internal.analysis.runOfferCriterionWorker,
                                    { runId },
                                );
                                remaining -= 1;
                            }
                        }
                    }
                }
            }
        }

        if (otherRuns.length === 0) {
            return;
        }

        const dispatch = async (run: Doc<"analysisRuns">) => {
            try {
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

                await ctx.runMutation(internal.analysis.markRunDispatched, { runId: run._id });
            } catch (error) {
                console.error("[analysis] dispatch failed", {
                    runId: run._id,
                    type: run.type,
                    error,
                });
            }
        };

        // Dispatch any runs marked "läuft" but not yet dispatched
        const pendingDispatch = otherRuns.filter(
            (run) => run.status === "läuft" && !run.dispatchedAt,
        );
        for (const run of pendingDispatch) {
            await dispatch(run);
        }

        // Calculate active counts per project
        const activeByProject = new Map<string, number>();
        for (const run of otherRuns) {
            if (run.status === "läuft") {
                const current = activeByProject.get(run.projectId) ?? 0;
                activeByProject.set(run.projectId, current + 1);
            }
        }

        // Get total org-wide active count
        let totalActiveCount = otherRuns.filter((run) => run.status === "läuft").length;

        // Get queued runs sorted by queuedAt (FIFO)
        const queued = otherRuns
            .filter((run) => run.status === "wartet")
            .sort((a, b) => (a.queuedAt ?? 0) - (b.queuedAt ?? 0));

        // Dispatch queued runs respecting both org-wide and per-project limits
        for (const run of queued) {
            // Check org-wide limit (safety cap)
            if (totalActiveCount >= MAX_ACTIVE_RUNS_PER_ORG) {
                break;
            }

            // Check per-project limit
            const projectActiveCount = activeByProject.get(run.projectId) ?? 0;
            if (projectActiveCount >= MAX_ACTIVE_RUNS_PER_PROJECT) {
                // Skip this run - its project already has max active runs
                continue;
            }

            // Start the run
            await ctx.runMutation(internal.analysis.markRunStarted, { runId: run._id });

            // Update counts
            totalActiveCount += 1;
            activeByProject.set(run.projectId, projectActiveCount + 1);

            await dispatch(run);
        }
    },
});

export const cleanStaleRuns = internalMutation({
    args: {
        orgId: v.string(),
        timeoutMs: v.number(),
    },
    handler: async (ctx, { orgId, timeoutMs }) => {
        const now = Date.now();
        const runs = (await ctx.runQuery(internal.analysis.listRunsByOrg, {
            orgId,
        })) as Doc<"analysisRuns">[];
        const stale = runs.filter(
            (run) =>
                run.type !== "offer_check" &&
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

        const processingJobs = await ctx.db
            .query("offerCriterionJobs")
            .withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "processing"))
            .collect();

        let jobUpdates = 0;
        for (const job of processingJobs) {
            if (!job.startedAt || now - job.startedAt <= OFFER_JOB_TIMEOUT_MS) {
                continue;
            }

            if (job.attempts < OFFER_JOB_MAX_ATTEMPTS) {
                await ctx.runMutation(internal.analysis.resetOfferJobToPending, {
                    jobId: job._id,
                    retryAfter: now + 5000,
                });
                jobUpdates += 1;
            } else {
                await ctx.runMutation(internal.analysis.markOfferJobFailed, {
                    jobId: job._id,
                    errorCode: "TIMEOUT",
                    errorMessage: `Job nach ${OFFER_JOB_TIMEOUT_MS}ms abgebrochen.`,
                });
                jobUpdates += 1;
            }
        }

        if (stale.length > 0 || jobUpdates > 0) {
            await ctx.scheduler.runAfter(0, internal.analysis.kickQueue, { orgId });
        }
    },
});

export const removeStandardOpenQuestions = internalMutation({
	args: {
		orgId: v.optional(v.string()),
	},
	handler: async (ctx, { orgId }) => {
		const results = await ctx.db
			.query("analysisResults")
			.withIndex("by_type", (q) => q.eq("type", "standard"))
			.collect();

		let patched = 0;
		for (const entry of results) {
			if (orgId && entry.orgId !== orgId) {
				continue;
			}

			const standard = entry.standard as Record<string, unknown> | undefined;
			if (!standard || !("openQuestions" in standard)) {
				continue;
			}

				const { openQuestions: _deprecated, ...rest } = standard;
				await ctx.db.patch(entry._id, {
					standard: rest as Doc<"analysisResults">["standard"],
				});
			patched += 1;
		}

		return { patched };
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

function buildDocumentContext(
	pages: Array<{
		page: number;
		text: string;
		documentId: Id<"documents">;
		documentName: string | null;
	}>,
	lookup: DocumentLookup,
) {
	const legend = formatDocumentLegend(lookup);
	const body = pages
		.map((page) => {
			const meta = lookup.byId.get(page.documentId);
			const name = meta?.documentName ?? "Unbenanntes Dokument";
			const key = meta?.documentKey ?? "?";
			return `Dokument ${key} (${name}) — Seite ${page.page}:\n${page.text}`;
		})
		.join("\n\n");

	return limitPromptText(`${legend}\n\n${body}`, MAX_PROMPT_CHARS, MAX_PROMPT_TOKENS);
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

function estimateTokens(text: string) {
	return Math.ceil(text.length / 4);
}

function limitPromptText(text: string, maxChars: number, maxTokens: number) {
	let capped = text;
	if (capped.length > maxChars) {
		capped = capped.slice(0, maxChars);
		const omitted = text.length - maxChars;
		capped = `${capped}\n\n[TRUNCATED ${omitted} CHARS]`;
	}

	const estimatedTokens = estimateTokens(capped);
	if (estimatedTokens <= maxTokens) {
		return capped;
	}

	const allowedChars = Math.max(1, Math.floor(maxTokens * 4));
	const truncated = capped.slice(0, allowedChars);
	const omitted = Math.max(0, capped.length - allowedChars);
	return `${truncated}\n\n[TRUNCATED ${omitted} CHARS]`;
}

// ========== OFFERTEN-VERGLEICH ACTIONS ==========

type PflichtenheftExtractArgs = {
	projectId: Id<"projects">;
};

type PflichtenheftExtractResult = {
	status: "fertig";
	templateId: Id<"templates">;
	criteriaCount: number;
};

/**
 * Extract criteria from Pflichtenheft document
 * Creates a template with extracted Muss- and Kann-Kriterien
 */
export const extractPflichtenheftCriteria: RegisteredAction<
	"public",
	PflichtenheftExtractArgs,
	Promise<PflichtenheftExtractResult>
> = action({
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
				internal.analysis.getPflichtenheftDocPageIdsForProject,
				{ projectId: args.projectId, orgId: identity.orgId },
			)) as Id<"docPages">[];

		if (docPageIds.length === 0) {
			throw new ConvexError("Keine Pflichtenheft-Dokumente zum Analysieren gefunden.");
		}

		const run = await acquireRun(ctx, project._id, identity.orgId, "pflichtenheft_extract", {
			userId: identity.userId,
		});
		const pages = await fetchDocPages(ctx, docPageIds, identity.orgId, project._id);

		if (pages.length === 0) {
			throw new ConvexError("Keine Dokumentseiten gefunden.");
		}

		try {
			const { result, usage, latencyMs, meta } = await analysePflichtenheft(pages);

			// Create template from extracted criteria
			type TemplateCriterion = Doc<"templates">["criteria"][number];
			const criteriaArray: TemplateCriterion[] = [];

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
			const templateId: Id<"templates"> = await ctx.runMutation(
				internal.analysis.createTemplateFromExtraction,
				{
					projectId: project._id,
					orgId: identity.orgId,
					createdBy: identity.userId,
					name: `${project.name} - Kriterien`,
					description: `Automatisch extrahierte Kriterien aus Pflichtenheft`,
					language: "de",
					version: "1.0",
					criteria: criteriaArray,
				},
			);

			// Mark run as finished
			await ctx.runMutation(internal.analysis.finishPflichtenheftRun, {
				runId: run._id,
				projectId: project._id,
				templateId,
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
			await failRun(ctx, run._id, error);
			throw error;
		}
	},
});

/**
 * Check a single offer against all criteria in the template.
 * This now schedules per-criterion jobs that are processed in parallel workers.
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

		const offer = (await ctx.runQuery(internal.analysis.getOfferForAnalysis, {
			offerId: args.offerId,
		})) as Doc<"offers"> | null;

		if (!offer || offer.orgId !== identity.orgId) {
			throw new ConvexError("Angebot nicht gefunden.");
		}
		if (offer.projectId !== project._id) {
			throw new ConvexError("Angebot gehört nicht zu diesem Projekt.");
		}

		if (!offer.documentId) {
			throw new ConvexError("Kein Dokument für dieses Angebot hochgeladen.");
		}

		const docPageIds = (await ctx.runQuery(
			internal.analysis.getDocPageIdsForDocument,
			{ documentId: offer.documentId },
		)) as Id<"docPages">[];

		if (docPageIds.length === 0) {
			throw new ConvexError("Keine Dokumentseiten im Angebot gefunden.");
		}

		const existingRun = (await ctx.runQuery(internal.analysis.getActiveOfferCheckRun, {
			offerId: args.offerId,
		})) as Doc<"analysisRuns"> | null;

		if (existingRun && (existingRun.status === "wartet" || existingRun.status === "läuft")) {
			await ctx.scheduler.runAfter(0, internal.analysis.kickQueue, {
				orgId: identity.orgId,
			});
			return { runId: existingRun._id, queued: true };
		}

                const uniqueCriteria = deduplicateCriteriaByKey(template.criteria);
                const totalCount = uniqueCriteria.length;
                if (totalCount === 0) {
                        throw new ConvexError("Template enthält keine Kriterien.");
                }

                const runId = (await ctx.runMutation(internal.analysis.startOfferCheckRun, {
			projectId: project._id,
			offerId: args.offerId,
			orgId: identity.orgId,
			userId: identity.userId,
			totalCount,
			provider: "PENDING",
			model: "PENDING",
		})) as Id<"analysisRuns">;

                await ctx.runMutation(internal.analysis.ensureOfferCriterionJobs, {
                        runId,
                        projectId: project._id,
                        offerId: args.offerId,
                        orgId: identity.orgId,
                        criteria: uniqueCriteria.map((criterion) => ({
                                key: criterion.key,
                                title: criterion.title,
                                description: criterion.description ?? null,
                                hints: criterion.hints ?? null,
                                required: criterion.required,
				weight: criterion.weight,
				keywords: criterion.keywords ?? [],
			})),
		});

		await ctx.scheduler.runAfter(0, internal.analysis.kickQueue, {
			orgId: identity.orgId,
		});

		return { runId, queued: true };
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

	const chunks = chunkPlainPages(pages, PAGES_PER_CHUNK);
	const mergedUsage: { promptTokens?: number; completionTokens?: number } = {};
	let totalLatency = 0;
	let lastMeta = { provider: "PENDING", model: "PENDING" } as {
		provider: string;
		model: string;
	};
	const results: Array<z.infer<typeof pflichtenheftExtractionSchema>> = [];

	for (const chunk of chunks) {
		const pagesText = chunk
			.map((page) => `Seite ${page.page}:\n${page.text}`)
			.join("\n\n");
		const cappedPagesText = limitPromptText(
			pagesText,
			MAX_PROMPT_CHARS,
			MAX_PROMPT_TOKENS,
		);

		const userPrompt = `Analysiere das folgende Pflichtenheft und extrahiere alle Muss-Kriterien und Kann-Kriterien:\n\n${cappedPagesText}`;

		const { parsed, usage, latencyMs, provider, model } = await callLlmForJson({
			systemPrompt,
			userPrompt,
			maxOutputTokens: 3500,
			temperature: 0.1,
		});

		const result = pflichtenheftExtractionSchema.parse(parsed);
		results.push(result);
		if (usage.promptTokens) {
			mergedUsage.promptTokens = (mergedUsage.promptTokens ?? 0) + usage.promptTokens;
		}
		if (usage.completionTokens) {
			mergedUsage.completionTokens =
				(mergedUsage.completionTokens ?? 0) + usage.completionTokens;
		}
		totalLatency += latencyMs;
		lastMeta = { provider, model };
	}

	return {
		result: mergePflichtenheftResults(results),
		usage: mergedUsage,
		latencyMs: totalLatency,
		meta: lastMeta,
	};
}

async function checkOfferCriterion(
	pages: Array<{
		page: number;
		text: string;
		documentId?: Id<"documents">;
		documentName?: string | null;
	}>,
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

	const criterionText = `
Kriterium: ${criterion.title}
${criterion.description ? `Beschreibung: ${criterion.description}` : ""}
${criterion.hints ? `Hinweise: ${criterion.hints}` : ""}
Typ: ${criterion.required ? "Muss-Kriterium" : "Kann-Kriterium"}
`;

	const chunks = chunkPlainPages(pages, OFFER_CHECK_PAGES_PER_CHUNK);
	const mergedUsage: { promptTokens?: number; completionTokens?: number } = {};
	let totalLatency = 0;
	let lastMeta = { provider: "PENDING", model: "PENDING" } as {
		provider: string;
		model: string;
	};
	const results: Array<z.infer<typeof offerCheckResultSchema>> = [];

	for (const chunk of chunks) {
		const pagesText = chunk
			.map((page) => `Seite ${page.page}:\n${page.text}`)
			.join("\n\n");
		const cappedPagesText = limitPromptText(
			pagesText,
			MAX_PROMPT_CHARS,
			MAX_PROMPT_TOKENS,
		);

		const userPrompt = `Prüfe das folgende Angebot gegen dieses Kriterium:\n\n${criterionText}\n\nAngebot:\n\n${cappedPagesText}`;

		const { parsed, usage, latencyMs, provider, model } = await callLlmForJson({
			systemPrompt,
			userPrompt,
			maxOutputTokens: 1000,
			temperature: 0.1,
		});

		const result = offerCheckResultSchema.parse(parsed);
		results.push(result);
		if (usage.promptTokens) {
			mergedUsage.promptTokens = (mergedUsage.promptTokens ?? 0) + usage.promptTokens;
		}
		if (usage.completionTokens) {
			mergedUsage.completionTokens =
				(mergedUsage.completionTokens ?? 0) + usage.completionTokens;
		}
		totalLatency += latencyMs;
		lastMeta = { provider, model };

		if (result.status === "erfuellt" && (result.citations ?? []).length > 0) {
			break;
		}
	}

	const merged = mergeOfferCheckResults(results);

	const documentMeta =
		pages.length > 0
			? {
					documentId: pages[0].documentId,
					documentName: pages[0].documentName ?? "Angebot",
					documentKey: "A",
				}
			: null;
	const enriched = {
		...merged,
		citations: (merged.citations ?? []).map((citation) => ({
			...citation,
			documentId: documentMeta?.documentId,
			documentName: documentMeta?.documentName ?? undefined,
			documentKey: documentMeta?.documentKey,
		})),
	};

	return {
		result: enriched,
		usage: mergedUsage,
		latencyMs: totalLatency,
		meta: lastMeta,
	};
}


// Internal mutations for Offerten-Vergleich
const templateCriterionInput = v.object({
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
});

export const createTemplateFromExtraction = internalMutation({
	args: {
		projectId: v.id("projects"),
		orgId: v.string(),
		createdBy: v.string(),
		name: v.string(),
		description: v.string(),
		language: v.string(),
		version: v.string(),
		criteria: v.array(templateCriterionInput),
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

export const getActiveOfferCheckRun = internalQuery({
	args: {
		offerId: v.id("offers"),
	},
	handler: async (ctx, { offerId }) => {
		const runs = await ctx.db
			.query("analysisRuns")
			.withIndex("by_offerId_type", (q) => q.eq("offerId", offerId).eq("type", "offer_check"))
			.collect();

		runs.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
		return runs.find((run) => run.status === "läuft" || run.status === "wartet") ?? null;
	},
});

export const startOfferCheckRun = internalMutation({
	args: {
		projectId: v.id("projects"),
		offerId: v.id("offers"),
		orgId: v.string(),
		userId: v.string(),
		totalCount: v.number(),
		provider: v.string(),
		model: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const runId = await ctx.db.insert("analysisRuns", {
			projectId: args.projectId,
			type: "offer_check",
			status: "läuft",
			error: undefined,
			queuedAt: now,
			startedAt: now,
			finishedAt: undefined,
			dispatchedAt: now,
			resultId: undefined,
			offerId: args.offerId,
			templateSnapshotId: undefined,
			provider: args.provider,
			model: args.model,
			promptTokens: 0,
			completionTokens: 0,
			latencyMs: 0,
			totalCount: args.totalCount,
			processedCount: 0,
			failedCount: 0,
			orgId: args.orgId,
			createdBy: args.userId,
			createdAt: now,
		});

		await ctx.runMutation(internal.offers.syncRunStatus, {
			offerId: args.offerId,
			runId,
			status: "läuft",
		});

		return runId;
	},
});

export const ensureOfferCriterionJobs = internalMutation({
	args: {
		runId: v.id("analysisRuns"),
		projectId: v.id("projects"),
		offerId: v.id("offers"),
		orgId: v.string(),
		criteria: v.array(
			v.object({
				key: v.string(),
				title: v.string(),
				description: v.optional(v.union(v.string(), v.null())),
				hints: v.optional(v.union(v.string(), v.null())),
				required: v.boolean(),
				weight: v.number(),
				keywords: v.array(v.string()),
			}),
		),
	},
	handler: async (ctx, args) => {
		const existingJobs = await ctx.db
			.query("offerCriterionJobs")
			.withIndex("by_run", (q) => q.eq("runId", args.runId))
			.collect();
		const existingKeys = new Set(existingJobs.map((job) => job.criterionKey));
		const now = Date.now();

		for (const criterion of args.criteria) {
			if (existingKeys.has(criterion.key)) {
				continue;
			}
			await ctx.db.insert("offerCriterionJobs", {
				projectId: args.projectId,
				runId: args.runId,
				offerId: args.offerId,
				criterionKey: criterion.key,
				criterionTitle: criterion.title,
				criterionDescription: criterion.description ?? undefined,
				criterionHints: criterion.hints ?? undefined,
				required: criterion.required,
				weight: criterion.weight,
				keywords: criterion.keywords,
				status: "pending",
				attempts: 0,
				errorCode: undefined,
				errorMessage: undefined,
				startedAt: undefined,
				finishedAt: undefined,
				retryAfter: undefined,
				orgId: args.orgId,
				createdAt: now,
				updatedAt: now,
			});
		}
	},
});

export const claimOfferCriterionJob = internalMutation({
	args: {
		runId: v.id("analysisRuns"),
	},
	handler: async (ctx, { runId }) => {
		const candidates = await ctx.db
			.query("offerCriterionJobs")
			.withIndex("by_run_status", (q) => q.eq("runId", runId).eq("status", "pending"))
			.take(25);

		const now = Date.now();
		const job = candidates.find(
			(entry) => entry.retryAfter === undefined || entry.retryAfter <= now,
		);

		if (!job) {
			return { jobId: null };
		}

		const startedAt = Date.now();
		await ctx.db.patch(job._id, {
			status: "processing",
			attempts: job.attempts + 1,
			startedAt,
			retryAfter: undefined,
			updatedAt: startedAt,
		});

		return { jobId: job._id };
	},
});

export const getOfferCriterionJob = internalQuery({
	args: {
		jobId: v.id("offerCriterionJobs"),
	},
	handler: async (ctx, { jobId }) => {
		return await ctx.db.get(jobId);
	},
});

export const markOfferJobDone = internalMutation({
	args: {
		jobId: v.id("offerCriterionJobs"),
		usage: v.object({
			promptTokens: v.optional(v.number()),
			completionTokens: v.optional(v.number()),
		}),
		latencyMs: v.number(),
		provider: v.string(),
		model: v.string(),
	},
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.jobId);
		if (!job) {
			return { runId: null };
		}

		const run = await ctx.db.get(job.runId);
		if (!run) {
			return { runId: null };
		}

		const summarize = async () => {
			const jobs = await ctx.db
				.query("offerCriterionJobs")
				.withIndex("by_run", (q) => q.eq("runId", job.runId))
				.collect();

			let processed = 0;
			let failed = 0;
			for (const entry of jobs) {
				if (entry.status === "done") {
					processed += 1;
				} else if (entry.status === "error") {
					failed += 1;
				}
			}

			const total = run.totalCount ?? jobs.length;
			return {
				processed,
				failed,
				total,
				isComplete: processed + failed >= total,
			};
		};

		if (job.status === "done" || job.status === "error") {
			const summary = await summarize();
			await ctx.db.patch(run._id, {
				processedCount: summary.processed,
				failedCount: summary.failed,
			});
			return {
				runId: run._id,
				orgId: run.orgId,
				offerId: run.offerId ?? null,
				isComplete: summary.isComplete,
				hasFailures: summary.failed > 0,
			};
		}

		const now = Date.now();
		await ctx.db.patch(job._id, {
			status: "done",
			errorCode: undefined,
			errorMessage: undefined,
			finishedAt: now,
			updatedAt: now,
		});

		const summary = await summarize();
		const promptTokens = (run.promptTokens ?? 0) + (args.usage.promptTokens ?? 0);
		const completionTokens = (run.completionTokens ?? 0) + (args.usage.completionTokens ?? 0);
		const latencyMs = (run.latencyMs ?? 0) + args.latencyMs;

		await ctx.db.patch(run._id, {
			processedCount: summary.processed,
			failedCount: summary.failed,
			promptTokens,
			completionTokens,
			latencyMs,
			provider: run.provider === "PENDING" ? args.provider : run.provider,
			model: run.model === "PENDING" ? args.model : run.model,
		});

		return {
			runId: run._id,
			orgId: run.orgId,
			offerId: run.offerId ?? null,
			isComplete: summary.isComplete,
			hasFailures: summary.failed > 0,
		};
	},
});

export const markOfferJobFailed = internalMutation({
	args: {
		jobId: v.id("offerCriterionJobs"),
		errorCode: v.optional(v.string()),
		errorMessage: v.optional(v.string()),
		usage: v.optional(
			v.object({
				promptTokens: v.optional(v.number()),
				completionTokens: v.optional(v.number()),
			}),
		),
		latencyMs: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.jobId);
		if (!job) {
			return { runId: null };
		}

		const run = await ctx.db.get(job.runId);
		if (!run) {
			return { runId: null };
		}

		const summarize = async () => {
			const jobs = await ctx.db
				.query("offerCriterionJobs")
				.withIndex("by_run", (q) => q.eq("runId", job.runId))
				.collect();

			let processed = 0;
			let failed = 0;
			for (const entry of jobs) {
				if (entry.status === "done") {
					processed += 1;
				} else if (entry.status === "error") {
					failed += 1;
				}
			}

			const total = run.totalCount ?? jobs.length;
			return {
				processed,
				failed,
				total,
				isComplete: processed + failed >= total,
			};
		};

		if (job.status === "error" || job.status === "done") {
			const summary = await summarize();
			await ctx.db.patch(run._id, {
				processedCount: summary.processed,
				failedCount: summary.failed,
			});
			return {
				runId: run._id,
				orgId: run.orgId,
				offerId: run.offerId ?? null,
				isComplete: summary.isComplete,
				hasFailures: summary.failed > 0,
			};
		}

		const now = Date.now();
		await ctx.db.patch(job._id, {
			status: "error",
			errorCode: args.errorCode,
			errorMessage: args.errorMessage,
			finishedAt: now,
			updatedAt: now,
		});

		const summary = await summarize();
		const promptTokens =
			(run.promptTokens ?? 0) + (args.usage?.promptTokens ?? 0);
		const completionTokens =
			(run.completionTokens ?? 0) + (args.usage?.completionTokens ?? 0);
		const latencyMs = (run.latencyMs ?? 0) + (args.latencyMs ?? 0);

		await ctx.db.patch(run._id, {
			processedCount: summary.processed,
			failedCount: summary.failed,
			promptTokens,
			completionTokens,
			latencyMs,
		});

		return {
			runId: run._id,
			orgId: run.orgId,
			offerId: run.offerId ?? null,
			isComplete: summary.isComplete,
			hasFailures: summary.failed > 0,
		};
	},
});

export const resetOfferJobToPending = internalMutation({
	args: {
		jobId: v.id("offerCriterionJobs"),
		retryAfter: v.optional(v.number()),
	},
	handler: async (ctx, { jobId, retryAfter }) => {
		const job = await ctx.db.get(jobId);
		if (!job) {
			return;
		}
		await ctx.db.patch(jobId, {
			status: "pending",
			startedAt: undefined,
			finishedAt: undefined,
			errorCode: undefined,
			errorMessage: undefined,
			retryAfter,
			updatedAt: Date.now(),
		});
	},
});

export const countOfferJobsForOrg = internalQuery({
	args: {
		orgId: v.string(),
	},
	handler: async (ctx, { orgId }) => {
		const jobs = await ctx.db
			.query("offerCriterionJobs")
			.withIndex("by_org_status", (q) => q.eq("orgId", orgId))
			.collect();

		let pending = 0;
		let processing = 0;
		for (const job of jobs) {
			if (job.status === "pending") pending += 1;
			if (job.status === "processing") processing += 1;
		}
		return { pending, processing };
	},
});

export const listOfferRunsWithPendingJobs = internalQuery({
	args: {
		orgId: v.string(),
		limit: v.number(),
	},
	handler: async (ctx, { orgId, limit }) => {
		const jobs = await ctx.db
			.query("offerCriterionJobs")
			.withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "pending"))
			.take(limit * 5);

		const runIds: Id<"analysisRuns">[] = [];
		const seen = new Set<string>();
		for (const job of jobs) {
			if (!seen.has(job.runId)) {
				runIds.push(job.runId);
				seen.add(job.runId);
				if (runIds.length >= limit) {
					break;
				}
			}
		}
		return runIds;
	},
});

export const completeOfferCheckRun = internalMutation({
	args: {
		runId: v.id("analysisRuns"),
		status: v.union(v.literal("fertig"), v.literal("fehler")),
		errorMessage: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		if (!run || run.type !== "offer_check") {
			return;
		}

		if (run.status === "fertig" || run.status === "fehler") {
			return;
		}

		const now = Date.now();
		await ctx.db.patch(run._id, {
			status: args.status,
			error: args.errorMessage,
			finishedAt: now,
		});

		if (run.offerId) {
			await ctx.runMutation(internal.offers.syncRunStatus, {
				offerId: run.offerId,
				runId: run._id,
				status: args.status,
			});
		}
	},
});

export const getOfferRunErrorSummary = internalQuery({
	args: {
		runId: v.id("analysisRuns"),
	},
	handler: async (ctx, { runId }) => {
		const jobs = await ctx.db
			.query("offerCriterionJobs")
			.withIndex("by_run_status", (q) => q.eq("runId", runId).eq("status", "error"))
			.collect();

		if (jobs.length === 0) {
			return { hasFailures: false, message: undefined };
		}

		const failingKeys = jobs.map((job) => job.criterionKey).slice(0, 5);
		const message =
			`Kriterien fehlgeschlagen: ${failingKeys.join(", ")}` +
			(jobs.length > 5 ? " …" : "");
		return { hasFailures: true, message };
	},
});

export const upsertOfferCriterionResult = internalMutation({
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
		const existing = await ctx.db
			.query("offerCriteriaResults")
			.withIndex("by_runId", (q) => q.eq("runId", args.runId))
			.filter((q) => q.eq(q.field("criterionKey"), args.criterionKey))
			.first();

		const now = Date.now();
		if (existing) {
			await ctx.db.patch(existing._id, {
				status: args.status,
				comment: args.comment,
				citations: args.citations,
				confidence: args.confidence,
				provider: args.provider,
				model: args.model,
				updatedAt: now,
				checkedAt: now,
			});
			return existing._id;
		}

		return await ctx.db.insert("offerCriteriaResults", {
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
