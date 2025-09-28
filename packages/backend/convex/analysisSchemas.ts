import { z } from "zod";

export const citationSchema = z.object({
	page: z.number(),
	quote: z.string().min(1),
});

export const standardResultSchema = z.object({
	summary: z.string().min(1),
	milestones: z.array(
		z.object({
			title: z.string().min(1),
			date: z.string().optional(),
			citation: citationSchema.optional(),
		}),
	),
	requirements: z.array(
		z.object({
			title: z.string().min(1),
			category: z.string().optional(),
			notes: z.string().optional(),
			citation: citationSchema.optional(),
		}),
	),
	openQuestions: z.array(
		z.object({
			question: z.string().min(1),
			citation: citationSchema.optional(),
		}),
	),
	metadata: z.array(
		z.object({
			label: z.string().min(1),
			value: z.string().min(1),
			citation: citationSchema.optional(),
		}),
	),
});

export const criteriaItemSchema = z.object({
	status: z.enum(["gefunden", "nicht_gefunden", "teilweise"]),
	comment: z.string().optional(),
	answer: z.string().optional(),
	citations: z.array(citationSchema).min(0),
	score: z.number().optional(),
});
