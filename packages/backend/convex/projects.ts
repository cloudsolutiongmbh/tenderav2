import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getIdentityOrThrow } from "./auth";
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

const MAX_ACTIVE_RUNS_PER_ORG = Number.parseInt(
	process.env.CONVEX_MAX_ACTIVE_RUNS_PER_ORG ?? "1",
);

export const create = mutation({
	args: {
		name: v.string(),
		customer: v.string(),
		tags: v.array(v.string()),
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

		return {
			runId,
			status: shouldStartImmediately ? "läuft" : "wartet",
		};
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
