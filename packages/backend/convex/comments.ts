import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

import { getIdentityOrThrow } from "./auth";

export const listByProject = query({
	args: {
		projectId: v.id("projects"),
	},
	handler: async (ctx, { projectId }) => {
		const identity = await getIdentityOrThrow(ctx);
		const project = await ctx.db.get(projectId);
		if (!project || project.orgId !== identity.orgId) {
			throw new Error("Projekt nicht gefunden.");
		}

		return await ctx.db
			.query("comments")
			.withIndex("by_projectId", (q) => q.eq("projectId", projectId))
			.collect();
	},
});

export const add = mutation({
	args: {
		projectId: v.id("projects"),
		contextType: v.union(
			v.literal("general"),
			v.literal("milestone"),
			v.literal("criterion"),
		),
		referenceId: v.optional(v.string()),
		referenceLabel: v.optional(v.string()),
		content: v.string(),
	},
	handler: async (ctx, { projectId, contextType, referenceId, referenceLabel, content }) => {
		const identity = await getIdentityOrThrow(ctx);
		const project = await ctx.db.get(projectId);
		if (!project || project.orgId !== identity.orgId) {
			throw new Error("Projekt nicht gefunden.");
		}

		const now = Date.now();
		const commentId = await ctx.db.insert("comments", {
			projectId,
			contextType,
			referenceId,
			referenceLabel,
			content,
			orgId: identity.orgId,
			createdBy: identity.userId,
			createdAt: now,
		});

		return commentId;
	},
});
