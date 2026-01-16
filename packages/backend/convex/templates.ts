import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getIdentityOrThrow } from "./auth";
import type { Id } from "./_generated/dataModel";

const criterionValidator = v.object({
	key: v.string(),
	title: v.string(),
	description: v.optional(v.string()),
	hints: v.optional(v.string()),
	answerType: v.union(v.literal("boolean"), v.literal("skala"), v.literal("text")),
	weight: v.number(),
	required: v.boolean(),
	keywords: v.optional(v.array(v.string())),
	sourcePages: v.optional(v.array(v.number())),
});

export const list = query({
	handler: async (ctx) => {
		const identity = await getIdentityOrThrow(ctx);
		return await ctx.db
			.query("templates")
			.withIndex("by_orgId", (q) => q.eq("orgId", identity.orgId))
			.collect();
	},
});

export const get = query({
	args: {
		templateId: v.id("templates"),
	},
	handler: async (ctx, { templateId }) => {
		const identity = await getIdentityOrThrow(ctx);
		const template = await ctx.db.get(templateId);
		if (!template || template.orgId !== identity.orgId) {
			throw new Error("Template nicht gefunden.");
		}
		return template;
	},
});

export const upsert = mutation({
	args: {
		templateId: v.optional(v.id("templates")),
		name: v.string(),
		description: v.optional(v.string()),
		language: v.string(),
		version: v.string(),
		visibleOrgWide: v.boolean(),
		criteria: v.array(criterionValidator),
	},
	handler: async (ctx, args) => {
		const identity = await getIdentityOrThrow(ctx);
		const now = Date.now();

		validateCriteria(args.criteria);

		if (args.templateId) {
			const existing = await ctx.db.get(args.templateId);
			if (!existing || existing.orgId !== identity.orgId) {
				throw new Error("Template nicht gefunden.");
			}

			await ctx.db.patch(args.templateId, {
				name: args.name,
				description: args.description,
				language: args.language,
				version: args.version,
				visibleOrgWide: args.visibleOrgWide,
				criteria: normalizeCriteriaKeys(args.criteria, existing.criteria),
				updatedAt: now,
				updatedBy: identity.userId,
			});

			return args.templateId;
		}

		const templateId = await ctx.db.insert("templates", {
			name: args.name,
			description: args.description,
			language: args.language,
			version: args.version,
			visibleOrgWide: args.visibleOrgWide,
			criteria: normalizeCriteriaKeys(args.criteria),
			orgId: identity.orgId,
			createdBy: identity.userId,
			updatedBy: identity.userId,
			createdAt: now,
			updatedAt: now,
		});

		return templateId;
	},
});

export const remove = mutation({
    args: {
        templateId: v.id("templates"),
    },
    handler: async (ctx, { templateId }) => {
        const identity = await getIdentityOrThrow(ctx);
        const template = await ctx.db.get(templateId);
        if (!template || template.orgId !== identity.orgId) {
            throw new Error("Template nicht gefunden.");
        }

        // Prevent deletion if in use by any project in the same org
        const projectsInOrg = await ctx.db
            .query("projects")
            .withIndex("by_orgId", (q) => q.eq("orgId", identity.orgId))
            .collect();

        const inUse = projectsInOrg.some((p) => p.templateId === (templateId as Id<"templates">));
        if (inUse) {
            throw new Error("Template ist einem oder mehreren Projekten zugewiesen und kann nicht gelöscht werden.");
        }

        await ctx.db.delete(templateId);
        return { success: true };
    },
});

function validateCriteria(criteria: Array<{ weight: number }>) {
	for (const criterion of criteria) {
		if (criterion.weight < 0 || criterion.weight > 100) {
			throw new Error("Gewicht muss zwischen 0 und 100 liegen.");
		}
	}
}

function normalizeCriteriaKeys(
	criteria: Array<{
		key: string;
		title: string;
		description?: string;
		hints?: string;
		answerType: "boolean" | "skala" | "text";
		weight: number;
		required: boolean;
		keywords?: string[];
		sourcePages?: number[];
	}>,
	previous?: Array<{
		key: string;
		title: string;
		description?: string;
		hints?: string;
		answerType: "boolean" | "skala" | "text";
		weight: number;
		required: boolean;
		keywords?: string[];
		sourcePages?: number[];
	}>,
) {
	const seen = new Set<string>();
	const fallbackKeys = new Map<string, string>();

	previous?.forEach((item) => {
		fallbackKeys.set(item.title, item.key);
	});

	return criteria.map((criterion, index) => {
		let key = criterion.key.trim();
		if (!key) {
			key = fallbackKeys.get(criterion.title) ?? `criterion-${index + 1}`;
		}

		if (seen.has(key)) {
			key = `${key}-${index + 1}`;
		}

		seen.add(key);

		return {
			...criterion,
			key,
		};
	});
}
