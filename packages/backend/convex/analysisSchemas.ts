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

// Lightweight JSON Schemas for Responses API structured outputs
export const citationJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    page: { type: "number" },
    quote: { type: "string" },
  },
  required: ["page", "quote"],
} as const;

export const standardResultJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    milestones: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          date: { type: ["string", "null"] },
          citation: { anyOf: [citationJsonSchema, { type: "null" }] },
        },
        required: ["title"],
      },
    },
    requirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          category: { type: ["string", "null"] },
          notes: { type: ["string", "null"] },
          citation: { anyOf: [citationJsonSchema, { type: "null" }] },
        },
        required: ["title"],
      },
    },
    openQuestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          question: { type: "string" },
          citation: { anyOf: [citationJsonSchema, { type: "null" }] },
        },
        required: ["question"],
      },
    },
    metadata: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          value: { type: "string" },
          citation: { anyOf: [citationJsonSchema, { type: "null" }] },
        },
        required: ["label", "value"],
      },
    },
  },
  required: ["summary", "milestones", "requirements", "openQuestions", "metadata"],
} as const;

export const criteriaItemJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { enum: ["gefunden", "nicht_gefunden", "teilweise"], type: "string" },
    comment: { type: ["string", "null"] },
    answer: { type: ["string", "null"] },
    citations: {
      type: "array",
      items: citationJsonSchema,
    },
    score: { type: ["number", "null"] },
  },
  required: ["status", "citations"],
} as const;
