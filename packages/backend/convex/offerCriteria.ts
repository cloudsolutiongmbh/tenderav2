import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getIdentityOrThrow } from "./auth";
import type { Doc } from "./_generated/dataModel";

export const getByOffer = query({
	args: {
		offerId: v.id("offers"),
	},
	handler: async (ctx, args) => {
		const identity = await getIdentityOrThrow(ctx);
		const orgId = identity.orgId;

		// Verify offer access
		const offer = await ctx.db.get(args.offerId);
		if (!offer || offer.orgId !== orgId) {
			return [];
		}

		const latestRunId = offer.latestRunId;
		if (!latestRunId) {
			return [];
		}

		const results = await ctx.db
			.query("offerCriteriaResults")
			.withIndex("by_runId", (q) => q.eq("runId", latestRunId))
			.filter((q) => q.eq(q.field("orgId"), orgId))
			.filter((q) => q.eq(q.field("offerId"), args.offerId))
			.collect();

		return results;
	},
});

export const getByProject = query({
	args: {
		projectId: v.id("projects"),
	},
	handler: async (ctx, args) => {
		const identity = await getIdentityOrThrow(ctx);
		const orgId = identity.orgId;

		// Verify project access
		const project = await ctx.db.get(args.projectId);
		if (!project || project.orgId !== orgId) {
			return [];
		}

		const results = await ctx.db
			.query("offerCriteriaResults")
			.withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
			.filter((q) => q.eq(q.field("orgId"), orgId))
			.collect();

		return results;
	},
});

export const getComparison = query({
	args: {
		projectId: v.id("projects"),
	},
	handler: async (ctx, args) => {
		const identity = await getIdentityOrThrow(ctx);
		const orgId = identity.orgId;

		// Verify project access
		const project = await ctx.db.get(args.projectId);
		if (!project || project.orgId !== orgId) {
			return {
				criteria: [],
				offers: [],
				matrix: {},
			};
		}

		// Get all offers for this project
		const offers = await ctx.db
			.query("offers")
			.withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
			.filter((q) => q.eq(q.field("orgId"), orgId))
			.collect();

		// Get results for the latest run of each offer
		const results: Doc<"offerCriteriaResults">[] = [];
		for (const offer of offers) {
			const latestRunId = offer.latestRunId;
			if (!latestRunId) {
				continue;
			}
			const offerResults = await ctx.db
				.query("offerCriteriaResults")
				.withIndex("by_runId", (q) => q.eq("runId", latestRunId))
				.filter((q) => q.eq(q.field("orgId"), orgId))
				.filter((q) => q.eq(q.field("offerId"), offer._id))
				.collect();
			results.push(...offerResults);
		}

		// Build unique criteria list
		const criteriaMap = new Map<string, {
			key: string;
			title: string;
			required: boolean;
			weight: number;
		}>();

		for (const result of results) {
			if (!criteriaMap.has(result.criterionKey)) {
				criteriaMap.set(result.criterionKey, {
					key: result.criterionKey,
					title: result.criterionTitle,
					required: result.required,
					weight: result.weight,
				});
			}
		}

		// Sort criteria: required first, then by weight descending
		const criteria = Array.from(criteriaMap.values()).sort((a, b) => {
			if (a.required !== b.required) {
				return a.required ? -1 : 1;
			}
			return b.weight - a.weight;
		});

		// Build matrix: criterionKey -> offerId -> result
		const matrix: Record<string, Record<string, typeof results[0]>> = {};
		for (const result of results) {
			if (!matrix[result.criterionKey]) {
				matrix[result.criterionKey] = {};
			}
			matrix[result.criterionKey][result.offerId] = result;
		}

		return {
			criteria,
			offers: offers.map((o) => ({
				_id: o._id,
				anbieterName: o.anbieterName,
				latestStatus: o.latestStatus,
			})),
			matrix,
		};
	},
});

export const archiveByRun = mutation({
	args: {
		runId: v.id("analysisRuns"),
	},
	handler: async (ctx, args) => {
		const identity = await getIdentityOrThrow(ctx);
		const orgId = identity.orgId;

		// Get all results for this run
		const results = await ctx.db
			.query("offerCriteriaResults")
			.withIndex("by_runId", (q) => q.eq("runId", args.runId))
			.filter((q) => q.eq(q.field("orgId"), orgId))
			.collect();

		// Delete them
		for (const result of results) {
			await ctx.db.delete(result._id);
		}

		return { deleted: results.length };
	},
});

export const insert = mutation({
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
		citations: v.array(
			v.object({
				documentId: v.optional(v.id("documents")),
				page: v.number(),
				quote: v.string(),
			}),
		),
		confidence: v.optional(v.number()),
		provider: v.optional(v.string()),
		model: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const identity = await getIdentityOrThrow(ctx);
		const orgId = identity.orgId;

		// Verify offer access
		const offer = await ctx.db.get(args.offerId);
		if (!offer || offer.orgId !== orgId) {
			throw new Error("Offer not found or access denied");
		}

		const now = Date.now();
		const resultId = await ctx.db.insert("offerCriteriaResults", {
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
			orgId,
			createdAt: now,
			updatedAt: now,
		});

		return resultId;
	},
});
