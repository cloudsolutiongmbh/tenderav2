import { mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getIdentityOrThrow } from "./auth";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { TableNames } from "./_generated/dataModel";

const isTestMode = process.env.CONVEX_TEST_MODE === "1";

function ensureTestMode() {
	if (!isTestMode) {
		throw new ConvexError("Test-Helper sind deaktiviert.");
	}
}

function buildCitationFromPages(pages: Doc<"docPages">[]): { page: number; quote: string } {
	if (pages.length === 0) {
		return { page: 1, quote: "Testinhalt" };
	}

	const source = pages[0];
	const clip = source.text.slice(0, 120).replace(/\s+/g, " ").trim();
	return {
		page: source.page,
		quote: clip.length > 0 ? clip : "Testinhalt",
	};
}

function buildAlternateCitation(pages: Doc<"docPages">[], index = 1) {
	if (pages.length <= index) {
		return buildCitationFromPages(pages);
	}
	const source = pages[index];
	const clip = source.text.slice(0, 120).replace(/\s+/g, " ").trim();
	return {
		page: source.page,
		quote: clip.length > 0 ? clip : "Testinhalt",
	};
}

async function loadProjectDocuments(
	ctx: MutationCtx,
	projectId: Id<"projects">,
) {
	const documents = await ctx.db
		.query("documents")
		.withIndex("by_projectId", (q) => q.eq("projectId", projectId))
		.collect();

	const pages: Doc<"docPages">[] = [];
	for (const document of documents) {
		const docPages = await ctx.db
			.query("docPages")
			.withIndex("by_documentId", (q) => q.eq("documentId", document._id))
			.collect();
		pages.push(
			...docPages.sort((a, b) => a.page - b.page),
		);
	}

	return { documents, pages };
}

export const reset = mutation({
	handler: async (ctx) => {
		ensureTestMode();
		const identity = await getIdentityOrThrow(ctx);
		const orgId = identity.orgId;

	const documents = await ctx.db.query("documents").collect();
	for (const document of documents) {
		if (document.orgId !== orgId) {
			continue;
		}
		const docPages = await ctx.db
			.query("docPages")
			.withIndex("by_documentId", (q) => q.eq("documentId", document._id))
			.collect();
		for (const page of docPages) {
			await ctx.db.delete(page._id);
		}
		if (document.storageId) {
			await ctx.storage.delete(document.storageId);
		}
		await ctx.db.delete(document._id);
	}

	const tables: TableNames[] = [
		"analysisResults",
		"analysisRuns",
		"projects",
		"templates",
		"shares",
		"comments",
	];

	for (const table of tables) {
		const entries = await ctx.db.query(table).collect();
		for (const entry of entries) {
			if ("orgId" in entry && entry.orgId === orgId) {
				await ctx.db.delete(entry._id);
			}
		}
	}

		return { success: true };
	},
});

export const completeStandardRun = mutation({
	args: {
		projectId: v.id("projects"),
	},
	handler: async (ctx, { projectId }) => {
		ensureTestMode();
		const identity = await getIdentityOrThrow(ctx);
		const project = await ctx.db.get(projectId);
		if (!project || project.orgId !== identity.orgId) {
			throw new ConvexError("Projekt nicht gefunden.");
		}

		const runs = await ctx.db
			.query("analysisRuns")
			.withIndex("by_projectId_type", (q) =>
				q.eq("projectId", projectId).eq("type", "standard"),
			)
			.collect();
		const run = runs.sort((a, b) => b.createdAt - a.createdAt)[0];

		if (!run) {
			throw new ConvexError("Keine Standard-Analyse gefunden.");
		}

		if (run.status === "fertig") {
			return { alreadyCompleted: true };
		}

		if (run.status === "wartet") {
			await ctx.db.patch(run._id, {
				status: "läuft",
				startedAt: Date.now(),
			});
		}

		const { pages } = await loadProjectDocuments(ctx, projectId);
		const citationPrimary = buildCitationFromPages(pages);
		const citationSecondary = buildAlternateCitation(pages, 1);

		const result = {
			summary:
				"Dieses Test-Ergebnis fasst die wichtigsten Inhalte der hochgeladenen Unterlagen zusammen und dient der Verifikation der UI.",
			milestones: [
				{
					title: "Angebotsabgabe",
					date: "2025-03-01",
					citation: citationPrimary,
				},
				{
					title: "Fragenrunde",
					date: "2025-02-10",
					citation: citationSecondary,
				},
			],
			requirements: [
				{
					title: "Referenzen",
					category: "Qualitativ",
					notes: "Mindestens zwei Referenzen einreichen.",
					citation: citationPrimary,
				},
				{
					title: "Sicherheitskonzept",
					category: "Organisatorisch",
					notes: "Konzept gemäss Ausschreibung beilegen.",
					citation: citationSecondary,
				},
			],
			metadata: [
				{
					label: "Vergabestelle",
					value: "Testkommune",
					citation: citationSecondary,
				},
				{
					label: "Budget",
					value: "CHF 1'000'000",
					citation: citationPrimary,
				},
			],
		};

		await ctx.runMutation(internal.analysis.recordStandardResult, {
			projectId,
			runId: run._id,
			orgId: project.orgId,
			result,
			telemetry: {
				provider: "TEST",
				model: "mock-standard",
				promptTokens: 0,
				completionTokens: 0,
				latencyMs: 50,
			},
		});

		return { success: true };
	},
});

export const completeCriteriaRun = mutation({
	args: {
		projectId: v.id("projects"),
	},
	handler: async (ctx, { projectId }) => {
		ensureTestMode();
		const identity = await getIdentityOrThrow(ctx);
		const project = await ctx.db.get(projectId);
		if (!project || project.orgId !== identity.orgId) {
			throw new ConvexError("Projekt nicht gefunden.");
		}

		if (!project.templateId) {
			throw new ConvexError("Projekt hat kein Template.");
		}

		const template = await ctx.db.get(project.templateId);
		if (!template || template.orgId !== project.orgId) {
			throw new ConvexError("Template nicht gefunden.");
		}

		const runs = await ctx.db
			.query("analysisRuns")
			.withIndex("by_projectId_type", (q) =>
				q.eq("projectId", projectId).eq("type", "criteria"),
			)
			.collect();
		const run = runs.sort((a, b) => b.createdAt - a.createdAt)[0];

		if (!run) {
			throw new ConvexError("Keine Kriterien-Analyse gefunden.");
		}

		if (run.status === "fertig") {
			return { alreadyCompleted: true };
		}

		if (run.status === "wartet") {
			await ctx.db.patch(run._id, {
				status: "läuft",
				startedAt: Date.now(),
			});
		}

		const { pages } = await loadProjectDocuments(ctx, projectId);
		const citationPrimary = buildCitationFromPages(pages);
		const citationSecondary = buildAlternateCitation(pages, 1);

		const items = template.criteria.map((criterion, index) => {
			const status: "gefunden" | "nicht_gefunden" | "teilweise" =
				index % 2 === 0 ? "gefunden" : "nicht_gefunden";
			const citation = index % 2 === 0 ? citationPrimary : citationSecondary;

			return {
				key: criterion.key,
				title: criterion.title,
				description: criterion.description,
				hints: criterion.hints,
				answerType: criterion.answerType,
				weight: criterion.weight,
				required: criterion.required,
				keywords: criterion.keywords,
				status,
				comment:
					status === "gefunden"
						? "Kriterium wurde im Dokument bestätigt."
						: "Keine passenden Textstellen gefunden.",
				answer: status === "gefunden" ? "Ja" : "Nein",
				score: status === "gefunden" ? 1 : 0,
				citations: [citation],
			};
		});

		await ctx.runMutation(internal.analysis.recordCriteriaResult, {
			projectId,
			runId: run._id,
			orgId: project.orgId,
			templateId: template._id,
			items,
			telemetry: {
				provider: "TEST",
				model: "mock-criteria",
				promptTokens: 0,
				completionTokens: 0,
				latencyMs: 40,
			},
		});

		return { success: true };
	},
});

export const expireShare = mutation({
	args: {
		token: v.string(),
	},
	handler: async (ctx, { token }) => {
		ensureTestMode();
		const identity = await getIdentityOrThrow(ctx);
		const share = await ctx.db
			.query("shares")
			.withIndex("by_token", (q) => q.eq("token", token))
			.first();

		if (!share || share.orgId !== identity.orgId) {
			throw new ConvexError("Share-Link nicht gefunden.");
		}

		await ctx.db.patch(share._id, {
			expiresAt: Date.now() - 1,
		});

		return { success: true };
	},
});
