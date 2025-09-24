import { action } from "./_generated/server";
import { v } from "convex/values";
import { getIdentityOrThrow } from "./auth";

const PLAIN_TEXT_MIME_TYPES = new Set(["text/plain", "text/markdown"]);
const APPROX_CHARS_PER_PAGE = 1800;

export const textFromFile = action({
	args: {
		storageId: v.id("_storage"),
		mimeType: v.string(),
	},
	handler: async (ctx, { storageId, mimeType }) => {
		await getIdentityOrThrow(ctx);

		if (!PLAIN_TEXT_MIME_TYPES.has(mimeType)) {
			throw new Error(
				"Serverseitige Textextraktion unterstützt aktuell nur Textdateien (TXT/Markdown).",
			);
		}

		const blob = await ctx.storage.get(storageId);
		if (!blob) {
			throw new Error("Datei nicht gefunden.");
		}

		const rawText = await blob.text();
		const normalized = rawText.replace(/\r\n/g, "\n").trim();

		if (!normalized) {
			return { pages: [] };
		}

		const pages = chunkIntoPages(normalized).map((text, index) => ({
			page: index + 1,
			text,
		}));

		return { pages };
	},
});

function chunkIntoPages(text: string): string[] {
	const chunks: string[] = [];
	let remaining = text;

	while (remaining.length > 0) {
		if (remaining.length <= APPROX_CHARS_PER_PAGE) {
			chunks.push(remaining);
			break;
		}

		let splitIndex = remaining.lastIndexOf("\n\n", APPROX_CHARS_PER_PAGE);
		if (splitIndex === -1 || splitIndex < APPROX_CHARS_PER_PAGE * 0.5) {
			splitIndex = APPROX_CHARS_PER_PAGE;
		}

		const chunk = remaining.slice(0, splitIndex).trim();
		if (chunk) {
			chunks.push(chunk);
		}
		remaining = remaining.slice(splitIndex).trim();
	}

	return chunks;
}
