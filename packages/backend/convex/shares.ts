import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getIdentityOrThrow } from "./auth";
import type { Id } from "./_generated/dataModel";

const DEFAULT_TTL_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const create = mutation({
	args: {
		projectId: v.id("projects"),
		ttlDays: v.optional(v.number()),
	},
	handler: async (ctx, { projectId, ttlDays }) => {
		const identity = await getIdentityOrThrow(ctx);
		const project = await ctx.db.get(projectId);
		if (!project || project.orgId !== identity.orgId) {
			throw new Error("Projekt nicht gefunden.");
		}

		const now = Date.now();
		const days = ttlDays && ttlDays > 0 ? ttlDays : DEFAULT_TTL_DAYS;
		const expiresAt = now + days * MS_PER_DAY;

		let token: string;
		while (true) {
			token = generateShareToken();
			const existing = await ctx.db
				.query("shares")
				.withIndex("by_token", (q) => q.eq("token", token))
				.first();
			if (!existing) {
				break;
			}
		}

		await ctx.db.insert("shares", {
			projectId,
			token,
			expiresAt,
			createdBy: identity.userId,
			orgId: identity.orgId,
			createdAt: now,
		});

		return { token, expiresAt };
	},
});

export const resolve = query({
	args: {
		token: v.string(),
	},
	handler: async (ctx, { token }) => {
		const share = await ctx.db
			.query("shares")
			.withIndex("by_token", (q) => q.eq("token", token))
			.first();

		if (!share) {
			return null;
		}

		if (share.expiresAt && share.expiresAt < Date.now()) {
			return null;
		}

		const project = await ctx.db.get(share.projectId);
		if (!project || project.orgId !== share.orgId) {
			return null;
		}

		const [standardResult, criteriaResult] = await Promise.all([
			loadLatestResult(ctx, share.projectId, "standard"),
			loadLatestResult(ctx, share.projectId, "criteria"),
		]);

		return {
			share: {
				expiresAt: share.expiresAt,
				createdAt: share.createdAt,
			},
			project: {
				_id: project._id,
				name: project.name,
				customer: project.customer,
				tags: project.tags,
				templateId: project.templateId,
			},
			standardResult,
			criteriaResult,
		};
	},
});

async function loadLatestResult(
	ctx: QueryCtx,
	projectId: Id<"projects">,
	type: "standard" | "criteria",
) {
	const results = await ctx.db
		.query("analysisResults")
		.withIndex("by_projectId_type", (q) =>
			q.eq("projectId", projectId).eq("type", type),
		)
		.collect();

	if (results.length === 0) {
		return null;
	}

	const latest = results.reduce((acc, current) =>
		current.createdAt > acc.createdAt ? current : acc,
	);

	if (type === "standard") {
		return {
			runId: latest.runId,
			createdAt: latest.createdAt,
			result: latest.standard,
		};
	}

	return {
		runId: latest.runId,
		createdAt: latest.createdAt,
		result: latest.criteria,
	};
}

const ALPHABET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function generateShareToken(length = 32) {
	const bytes = new Uint8Array(length);
	fillRandomBytes(bytes);

	let token = "";
	for (const byte of bytes) {
		token += ALPHABET[byte & 63];
	}

	return token;
}

function fillRandomBytes(bytes: Uint8Array) {
	if (typeof globalThis.crypto?.getRandomValues === "function") {
		globalThis.crypto.getRandomValues(bytes);
		return;
	}

	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = Math.floor(Math.random() * 256);
	}
}
