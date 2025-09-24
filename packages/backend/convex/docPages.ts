import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getIdentityOrThrow } from "./auth";

export const bulkInsert = mutation({
	args: {
		documentId: v.id("documents"),
		pages: v.array(
			v.object({
				page: v.number(),
				text: v.string(),
			}),
		),
	},
	handler: async (ctx, { documentId, pages }) => {
		const identity = await getIdentityOrThrow(ctx);
		const document = await ctx.db.get(documentId);
		if (!document || document.orgId !== identity.orgId) {
			throw new Error("Dokument nicht gefunden.");
		}

		if (pages.length === 0) {
			return { inserted: 0 };
		}

		await Promise.all(
			pages.map((page) =>
				ctx.db.insert("docPages", {
					documentId,
					page: page.page,
					text: page.text,
					orgId: identity.orgId,
				}),
			),
		);

		await ctx.db.patch(documentId, {
			pageCount: pages.length,
			textExtracted: true,
			updatedAt: Date.now(),
		});

		return { inserted: pages.length };
	},
});
