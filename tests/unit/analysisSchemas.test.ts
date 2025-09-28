import { describe, expect, it } from "vitest";

import {
	criteriaItemSchema,
	standardResultSchema,
} from "@tendera/backend/convex/analysisSchemas";

const citation = { page: 1, quote: "Testzitat" };

describe("standardResultSchema", () => {
	it("accepts a valid analysis result", () => {
		const result = standardResultSchema.parse({
			summary: "Zusammenfassung",
			milestones: [
				{ title: "Angebotsabgabe", date: "2025-03-01", citation },
			],
			requirements: [
				{ title: "Referenzen", category: "Qualitativ", notes: "Mindestens zwei", citation },
			],
			openQuestions: [{ question: "Gibt es eine Fristverlängerung?", citation }],
			metadata: [{ label: "Budget", value: "CHF 1 Mio.", citation }],
		});

		expect(result.summary).toBe("Zusammenfassung");
		expect(result.milestones).toHaveLength(1);
	});

	it("rejects when summary is missing", () => {
		expect(() =>
			standardResultSchema.parse({
				milestones: [],
				requirements: [],
				openQuestions: [],
				metadata: [],
			} as unknown),
		).toThrow();
	});
});

describe("criteriaItemSchema", () => {
	it("accepts a valid criterion entry", () => {
		const entry = criteriaItemSchema.parse({
			status: "gefunden",
			comment: "Nachweis vorhanden",
			answer: "Ja",
			citations: [citation],
			score: 1,
		});

		expect(entry.status).toBe("gefunden");
		expect(entry.citations[0].page).toBe(1);
	});

	it("rejects an unknown status", () => {
		expect(() =>
			criteriaItemSchema.parse({
				status: "offen",
				citations: [citation],
			} as unknown),
		).toThrow();
	});
});
