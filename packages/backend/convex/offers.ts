import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getIdentityOrThrow } from "./auth";

export const create = mutation({
	args: {
		projectId: v.id("projects"),
		anbieterName: v.string(),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const identity = await getIdentityOrThrow(ctx);
		const orgId = identity.orgId;

		// Verify project exists and belongs to org
		const project = await ctx.db.get(args.projectId);
		if (!project || project.orgId !== orgId) {
			throw new Error("Project not found or access denied");
		}

		const now = Date.now();
		const offerId = await ctx.db.insert("offers", {
			projectId: args.projectId,
			anbieterName: args.anbieterName,
			notes: args.notes,
			createdBy: identity.userId,
			orgId,
			createdAt: now,
			updatedAt: now,
		});

		return offerId;
	},
});

export const list = query({
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

		const offers = await ctx.db
			.query("offers")
			.withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
			.filter((q) => q.eq(q.field("orgId"), orgId))
			.collect();

		return offers;
	},
});

export const get = query({
	args: {
		offerId: v.id("offers"),
	},
	handler: async (ctx, args) => {
		const identity = await getIdentityOrThrow(ctx);
		const orgId = identity.orgId;

		const offer = await ctx.db.get(args.offerId);
		if (!offer || offer.orgId !== orgId) {
			return null;
		}

		return offer;
	},
});

export const update = mutation({
	args: {
		offerId: v.id("offers"),
		anbieterName: v.optional(v.string()),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const identity = await getIdentityOrThrow(ctx);
		const orgId = identity.orgId;

		const offer = await ctx.db.get(args.offerId);
		if (!offer || offer.orgId !== orgId) {
			throw new Error("Offer not found or access denied");
		}

		const updates: Partial<typeof offer> = {
			updatedAt: Date.now(),
		};

		if (args.anbieterName !== undefined) {
			updates.anbieterName = args.anbieterName;
		}
		if (args.notes !== undefined) {
			updates.notes = args.notes;
		}

		await ctx.db.patch(args.offerId, updates);
	},
});

export const remove = mutation({
	args: {
		offerId: v.id("offers"),
	},
	handler: async (ctx, args) => {
		const identity = await getIdentityOrThrow(ctx);
		const orgId = identity.orgId;

		const offer = await ctx.db.get(args.offerId);
		if (!offer || offer.orgId !== orgId) {
			throw new Error("Offer not found or access denied");
		}

		// Delete related criteria results
		const results = await ctx.db
			.query("offerCriteriaResults")
			.withIndex("by_offerId", (q) => q.eq("offerId", args.offerId))
			.collect();

		for (const result of results) {
			await ctx.db.delete(result._id);
		}

		// Delete the offer
		await ctx.db.delete(args.offerId);
	},
});

export const attachDocument = mutation({
	args: {
		offerId: v.id("offers"),
		documentId: v.id("documents"),
	},
	handler: async (ctx, args) => {
		const identity = await getIdentityOrThrow(ctx);
		const orgId = identity.orgId;

		const offer = await ctx.db.get(args.offerId);
		if (!offer || offer.orgId !== orgId) {
			throw new Error("Offer not found or access denied");
		}

		const document = await ctx.db.get(args.documentId);
		if (!document || document.orgId !== orgId) {
			throw new Error("Document not found or access denied");
		}

		await ctx.db.patch(args.offerId, {
			documentId: args.documentId,
			updatedAt: Date.now(),
		});
	},
});

export const ensureFromDocument = mutation({
	args: {
		projectId: v.id("projects"),
		documentId: v.id("documents"),
		anbieterName: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const identity = await getIdentityOrThrow(ctx);
		const orgId = identity.orgId;

		const project = await ctx.db.get(args.projectId);
		if (!project || project.orgId !== orgId) {
			throw new Error("Project not found or access denied");
		}

		const document = await ctx.db.get(args.documentId);
		if (!document || document.orgId !== orgId) {
			throw new Error("Document not found or access denied");
		}
		if (document.projectId !== args.projectId) {
			throw new Error("Document does not belong to project");
		}
		if (document.role !== "offer") {
			throw new Error("Document is not marked as offer");
		}

		const existing = await ctx.db
			.query("offers")
			.withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
			.filter((q) => q.eq(q.field("documentId"), args.documentId))
			.first();

		if (existing) {
			return { offerId: existing._id, created: false };
		}

		const now = Date.now();
		const fallbackName = deriveNameFromFilename(document.filename);
		const offerId = await ctx.db.insert("offers", {
			projectId: args.projectId,
			anbieterName: args.anbieterName?.trim() || fallbackName,
			notes: undefined,
			documentId: args.documentId,
			orgId,
			createdBy: identity.userId,
			createdAt: now,
			updatedAt: now,
		});

		return { offerId, created: true };
	},
});

function deriveNameFromFilename(filename: string) {
	const withoutExtension = filename.replace(/\.[^/.]+$/, "");
	return withoutExtension.trim() || filename;
}

export const syncRunStatus = internalMutation({
	args: {
		offerId: v.id("offers"),
		runId: v.id("analysisRuns"),
		status: v.union(
			v.literal("wartet"),
			v.literal("läuft"),
			v.literal("fertig"),
			v.literal("fehler"),
		),
	},
	handler: async (ctx, args) => {

		await ctx.db.patch(args.offerId, {
			latestRunId: args.runId,
			latestStatus: args.status,
			updatedAt: Date.now(),
		});
	},
});

export const computeMetrics = query({
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

		const offers = await ctx.db
			.query("offers")
			.withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
			.filter((q) => q.eq(q.field("orgId"), orgId))
			.collect();

		const metricsPromises = offers.map(async (offer) => {
			const latestRunId = offer.latestRunId;
			const results = latestRunId
				? await ctx.db
						.query("offerCriteriaResults")
						.withIndex("by_runId", (q) => q.eq("runId", latestRunId))
						.collect()
				: [];

			let totalWeight = 0;
			let achievedWeight = 0;
			let erfuellt = 0;
			let teilweise = 0;
			let nichtErfuellt = 0;
			let unklar = 0;

			for (const result of results) {
				totalWeight += result.weight;

				if (result.status === "erfuellt") {
					achievedWeight += result.weight;
					erfuellt++;
				} else if (result.status === "teilweise") {
					achievedWeight += result.weight * 0.5;
					teilweise++;
				} else if (result.status === "nicht_erfuellt") {
					nichtErfuellt++;
				} else {
					unklar++;
				}
			}

			const erfuellungsGrad = totalWeight > 0 ? (achievedWeight / totalWeight) * 100 : 0;

			return {
				offerId: offer._id,
				anbieterName: offer.anbieterName,
				erfuellungsGrad: Math.round(erfuellungsGrad),
				totalCriteria: results.length,
				erfuellt,
				teilweise,
				nichtErfuellt,
				unklar,
			};
		});

		return await Promise.all(metricsPromises);
	},
});
