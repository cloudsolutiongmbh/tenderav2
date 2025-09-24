import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const citationSchema = v.object({
	documentId: v.optional(v.id("documents")),
	page: v.number(),
	quote: v.string(),
});

const standardAnalysisSchema = v.object({
	summary: v.string(),
	milestones: v.array(
		v.object({
			title: v.string(),
			date: v.optional(v.string()),
			citation: v.optional(citationSchema),
		}),
	),
	requirements: v.array(
		v.object({
			title: v.string(),
			category: v.optional(v.string()),
			notes: v.optional(v.string()),
			citation: v.optional(citationSchema),
		}),
	),
	openQuestions: v.array(
		v.object({
			question: v.string(),
			citation: v.optional(citationSchema),
		}),
	),
	metadata: v.array(
		v.object({
			label: v.string(),
			value: v.string(),
			citation: v.optional(citationSchema),
		}),
	),
});

const criteriaItemSchema = v.object({
	criterionId: v.string(),
	title: v.string(),
	status: v.union(
		v.literal("gefunden"),
		v.literal("nicht_gefunden"),
		v.literal("teilweise"),
	),
	comment: v.optional(v.string()),
	answer: v.optional(v.string()),
	citations: v.array(citationSchema),
	score: v.optional(v.number()),
	weight: v.optional(v.number()),
});

const criteriaAnalysisSchema = v.object({
	templateId: v.optional(v.id("templates")),
	summary: v.optional(v.string()),
	items: v.array(criteriaItemSchema),
});

export default defineSchema({
	todos: defineTable({
		text: v.string(),
		completed: v.boolean(),
	}),
	projects: defineTable({
		name: v.string(),
		customer: v.string(),
		tags: v.array(v.string()),
		templateId: v.optional(v.id("templates")),
		latestRunId: v.optional(v.id("analysisRuns")),
		orgId: v.string(),
		createdBy: v.string(),
		createdAt: v.number(),
	})
		.index("by_orgId", ["orgId"]),
	comments: defineTable({
		projectId: v.id("projects"),
		contextType: v.union(
			v.literal("general"),
			v.literal("milestone"),
			v.literal("criterion"),
		),
		referenceId: v.optional(v.string()),
		referenceLabel: v.optional(v.string()),
		content: v.string(),
		orgId: v.string(),
		createdBy: v.string(),
		createdAt: v.number(),
	})
		.index("by_projectId", ["projectId"])
		.index("by_orgId", ["orgId"]),
	documents: defineTable({
		projectId: v.id("projects"),
		filename: v.string(),
		mimeType: v.string(),
		size: v.number(),
		storageId: v.id("_storage"),
		pageCount: v.optional(v.number()),
		textExtracted: v.boolean(),
		orgId: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_projectId", ["projectId"])
		.index("by_orgId", ["orgId"]),
	docPages: defineTable({
		documentId: v.id("documents"),
		page: v.number(),
		text: v.string(),
		orgId: v.string(),
	})
		.index("by_documentId", ["documentId"])
		.index("by_documentId_page", ["documentId", "page"]),
	templates: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
		language: v.string(),
		version: v.string(),
		visibleOrgWide: v.boolean(),
		criteria: v.array(
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
			}),
		),
		orgId: v.string(),
		createdBy: v.string(),
		updatedBy: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_orgId", ["orgId"])
		.index("by_visibility", ["visibleOrgWide"]),
	analysisRuns: defineTable({
		projectId: v.id("projects"),
		type: v.union(v.literal("standard"), v.literal("criteria")),
		status: v.union(
			v.literal("wartet"),
			v.literal("läuft"),
			v.literal("fertig"),
			v.literal("fehler"),
		),
		error: v.optional(v.string()),
		queuedAt: v.number(),
		startedAt: v.optional(v.number()),
		finishedAt: v.optional(v.number()),
		resultId: v.optional(v.id("analysisResults")),
		provider: v.string(),
		model: v.string(),
		promptTokens: v.optional(v.number()),
		completionTokens: v.optional(v.number()),
		latencyMs: v.optional(v.number()),
		orgId: v.string(),
		createdBy: v.string(),
		createdAt: v.number(),
	})
		.index("by_projectId", ["projectId"])
		.index("by_projectId_type", ["projectId", "type"])
		.index("by_orgId", ["orgId"]),
	analysisResults: defineTable({
		projectId: v.id("projects"),
		runId: v.id("analysisRuns"),
		type: v.union(v.literal("standard"), v.literal("criteria")),
		standard: v.optional(standardAnalysisSchema),
		criteria: v.optional(criteriaAnalysisSchema),
		orgId: v.string(),
		createdAt: v.number(),
	})
		.index("by_projectId", ["projectId"])
		.index("by_projectId_type", ["projectId", "type"])
		.index("by_type", ["type"]),
	shares: defineTable({
		projectId: v.id("projects"),
		token: v.string(),
		expiresAt: v.optional(v.number()),
		createdBy: v.string(),
		orgId: v.string(),
		createdAt: v.number(),
	})
		.index("by_token", ["token"])
		.index("by_projectId", ["projectId"]),
});
