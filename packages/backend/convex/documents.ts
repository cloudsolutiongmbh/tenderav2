import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getIdentityOrThrow } from "./auth";
import type { Id } from "./_generated/dataModel";

const DEFAULT_MAX_UPLOAD_MB = 200;
const maxUploadMb = Number.parseInt(process.env.MAX_UPLOAD_MB ?? `${DEFAULT_MAX_UPLOAD_MB}`);
const MAX_UPLOAD_BYTES = (Number.isNaN(maxUploadMb) ? DEFAULT_MAX_UPLOAD_MB : maxUploadMb) * 1024 * 1024;

export const createUploadUrl = mutation({
	handler: async (ctx) => {
		await getIdentityOrThrow(ctx);
		return await ctx.storage.generateUploadUrl();
	},
});

export const attach = mutation({
	args: {
		projectId: v.id("projects"),
		filename: v.string(),
		mimeType: v.string(),
		size: v.number(),
		storageId: v.id("_storage"),
	},
	handler: async (ctx, args) => {
		const identity = await getIdentityOrThrow(ctx);
		const project = await ctx.db.get(args.projectId);
		if (!project || project.orgId !== identity.orgId) {
			throw new Error("Projekt nicht gefunden.");
		}

		const existingDocuments = await ctx.db
			.query("documents")
			.withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
			.collect();

		const totalSize = existingDocuments.reduce((sum, doc) => sum + doc.size, 0) + args.size;
		if (totalSize > MAX_UPLOAD_BYTES) {
			throw new Error("Maximale Gesamtgrösse überschritten.");
		}

		const now = Date.now();
		const documentId = await ctx.db.insert("documents", {
			projectId: args.projectId,
			filename: args.filename,
			mimeType: args.mimeType,
			size: args.size,
			storageId: args.storageId,
			pageCount: undefined,
			textExtracted: false,
			orgId: identity.orgId,
			createdAt: now,
			updatedAt: now,
		});

		return await ctx.db.get(documentId);
	},
});

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
			.query("documents")
			.withIndex("by_projectId", (q) => q.eq("projectId", projectId))
			.collect();
	},
});
