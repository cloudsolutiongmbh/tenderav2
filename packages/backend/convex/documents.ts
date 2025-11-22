import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getIdentityOrThrow } from "./auth";
import type { Id } from "./_generated/dataModel";

const DEFAULT_MAX_UPLOAD_MB = 400;
const maxUploadMb = Number.parseInt(process.env.MAX_UPLOAD_MB ?? `${DEFAULT_MAX_UPLOAD_MB}`);
const MAX_UPLOAD_BYTES = (Number.isNaN(maxUploadMb) ? DEFAULT_MAX_UPLOAD_MB : maxUploadMb) * 1024 * 1024;

const DOCUMENT_ROLE_VALUES = ["pflichtenheft", "offer", "support"] as const;

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
		role: v.optional(
			v.union(
				v.literal(DOCUMENT_ROLE_VALUES[0]),
				v.literal(DOCUMENT_ROLE_VALUES[1]),
				v.literal(DOCUMENT_ROLE_VALUES[2]),
			),
		),
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
			role: args.role,
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

export const markExtracted = mutation({
	args: {
		documentId: v.id("documents"),
		pageCount: v.number(),
	},
	handler: async (ctx, { documentId, pageCount }) => {
		const identity = await getIdentityOrThrow(ctx);
		const document = await ctx.db.get(documentId);
		if (!document || document.orgId !== identity.orgId) {
			throw new Error("Dokument nicht gefunden.");
		}

		await ctx.db.patch(documentId, {
			pageCount,
			textExtracted: true,
			updatedAt: Date.now(),
		});

		return { success: true };
	},
});

export const remove = mutation({
	args: {
		documentId: v.id("documents"),
	},
	handler: async (ctx, { documentId }) => {
		const identity = await getIdentityOrThrow(ctx);
		const document = await ctx.db.get(documentId);
		if (!document || document.orgId !== identity.orgId) {
			throw new Error("Dokument nicht gefunden.");
		}

		const pages = await ctx.db
			.query("docPages")
			.withIndex("by_documentId", (q) => q.eq("documentId", documentId))
			.collect();

		// Remove any offers linked to this document (including results and jobs)
		const offers = await ctx.db
			.query("offers")
			.withIndex("by_projectId", (q) => q.eq("projectId", document.projectId))
			.filter((q) => q.eq(q.field("orgId"), identity.orgId))
			.collect();

		const offersToDelete = offers.filter((offer) => offer.documentId === documentId);
		for (const offer of offersToDelete) {
			const results = await ctx.db
				.query("offerCriteriaResults")
				.withIndex("by_offerId", (q) => q.eq("offerId", offer._id))
				.collect();
			for (const result of results) {
				await ctx.db.delete(result._id);
			}

			const jobs = await ctx.db
				.query("offerCriterionJobs")
				.withIndex("by_offer", (q) => q.eq("offerId", offer._id))
				.collect();
			for (const job of jobs) {
				await ctx.db.delete(job._id);
			}

			await ctx.db.delete(offer._id);
		}

		await Promise.all(pages.map((page) => ctx.db.delete(page._id)));
		await ctx.storage.delete(document.storageId);
		await ctx.db.delete(documentId);

		return {
			success: true,
			removedPages: pages.length,
			removedOffers: offersToDelete.length,
		};
	},
});
