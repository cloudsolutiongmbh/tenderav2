import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const citationSchema = v.object({
	documentId: v.optional(v.id("documents")),
	page: v.number(),
	quote: v.string(),
});

const PROJECT_TYPE_VALUES = ["standard", "offerten"] as const;
const standardAnalysisSchema = v.object({
	summary: v.union(v.string(), v.null()),
	milestones: v.array(
		v.object({
			title: v.string(),
			date: v.optional(v.union(v.string(), v.null())),
			citation: v.optional(v.union(citationSchema, v.null())),
		}),
	),
	requirements: v.array(
		v.object({
			title: v.string(),
			category: v.optional(v.union(v.string(), v.null())),
			notes: v.optional(v.union(v.string(), v.null())),
			citation: v.optional(v.union(citationSchema, v.null())),
		}),
	),
	openQuestions: v.optional(
		v.array(
			v.object({
				question: v.string(),
				citation: v.optional(v.union(citationSchema, v.null())),
			}),
		),
	),
	metadata: v.array(
		v.object({
			label: v.string(),
			value: v.string(),
			citation: v.optional(v.union(citationSchema, v.null())),
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
		projectType: v.optional(
			v.union(
				v.literal(PROJECT_TYPE_VALUES[0]),
				v.literal(PROJECT_TYPE_VALUES[1]),
			),
		),
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
		role: v.optional(v.union(
			v.literal("pflichtenheft"),
			v.literal("offer"),
			v.literal("support"),
		)),
		orgId: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_projectId", ["projectId"])
		.index("by_projectId_role", ["projectId", "role"])
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
				sourcePages: v.optional(v.array(v.number())),
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
		type: v.union(
			v.literal("standard"),
			v.literal("criteria"),
			v.literal("pflichtenheft_extract"),
			v.literal("offer_check"),
		),
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
		dispatchedAt: v.optional(v.number()),
		resultId: v.optional(v.id("analysisResults")),
		offerId: v.optional(v.id("offers")),
		templateSnapshotId: v.optional(v.id("templates")),
		provider: v.string(),
		model: v.string(),
		promptTokens: v.optional(v.number()),
		completionTokens: v.optional(v.number()),
		latencyMs: v.optional(v.number()),
		totalCount: v.optional(v.number()),
		processedCount: v.optional(v.number()),
		failedCount: v.optional(v.number()),
		orgId: v.string(),
		createdBy: v.string(),
		createdAt: v.number(),
	})
		.index("by_projectId", ["projectId"])
		.index("by_projectId_type", ["projectId", "type"])
		.index("by_orgId", ["orgId"])
		.index("by_offerId_type", ["offerId", "type"]),
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
	offers: defineTable({
		projectId: v.id("projects"),
		anbieterName: v.string(),
		documentId: v.optional(v.id("documents")),
		notes: v.optional(v.string()),
		latestRunId: v.optional(v.id("analysisRuns")),
		latestStatus: v.optional(
			v.union(
				v.literal("wartet"),
				v.literal("läuft"),
				v.literal("fertig"),
				v.literal("fehler"),
			),
		),
		createdBy: v.string(),
		orgId: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_projectId", ["projectId"])
		.index("by_orgId", ["orgId"]),
	offerCriteriaResults: defineTable({
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
		citations: v.array(citationSchema),
		confidence: v.optional(v.number()),
		provider: v.optional(v.string()),
		model: v.optional(v.string()),
		checkedAt: v.number(),
		orgId: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_offerId", ["offerId"])
		.index("by_projectId", ["projectId"])
		.index("by_projectId_offerId", ["projectId", "offerId"])
		.index("by_runId", ["runId"]),
	offerCriterionJobs: defineTable({
		projectId: v.id("projects"),
		runId: v.id("analysisRuns"),
		offerId: v.id("offers"),
		criterionKey: v.string(),
		criterionTitle: v.string(),
		criterionDescription: v.optional(v.string()),
		criterionHints: v.optional(v.string()),
		required: v.boolean(),
		weight: v.number(),
		keywords: v.optional(v.array(v.string())),
		status: v.union(
			v.literal("pending"),
			v.literal("processing"),
			v.literal("done"),
			v.literal("error"),
		),
		attempts: v.number(),
		errorCode: v.optional(v.string()),
		errorMessage: v.optional(v.string()),
		startedAt: v.optional(v.number()),
		finishedAt: v.optional(v.number()),
		retryAfter: v.optional(v.number()),
		orgId: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_run", ["runId"])
		.index("by_run_status", ["runId", "status"])
		.index("by_offer", ["offerId"])
		.index("by_offer_status", ["offerId", "status"])
		.index("by_org_status", ["orgId", "status"]),
});
