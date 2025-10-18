import { z } from "zod";

export const citationSchema = z.object({
    page: z.number(),
    quote: z.string().min(1),
});

export const standardResultSchema = z.object({
    summary: z.string().min(1).nullable(),
    milestones: z.array(
        z.object({
            title: z.string().min(1),
            date: z.string().nullable().optional(),
            citation: citationSchema.nullable().optional(),
        }),
    ),
    requirements: z.array(
        z.object({
            title: z.string().min(1),
            category: z.string().nullable().optional(),
            notes: z.string().nullable().optional(),
            citation: citationSchema.nullable().optional(),
        }),
    ),
    metadata: z.array(
        z.object({
            label: z.string().min(1),
            value: z.string().min(1),
            citation: citationSchema.nullable().optional(),
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
    summary: { type: ["string", "null"] },
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
        // In strict mode, required must include every key in properties; allow nulls where optional
        required: ["title", "date", "citation"],
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
        required: ["title", "category", "notes", "citation"],
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
        required: ["label", "value", "citation"],
      },
    },
  },
  required: ["summary", "milestones", "requirements", "metadata"],
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
  required: ["status", "comment", "answer", "citations", "score"],
} as const;

// Pflichtenheft extraction schemas
export const pflichtenheftCriterionSchema = z.object({
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    hints: z.string().nullable().optional(),
    pages: z.array(z.number().int().min(1)).min(1),
});

export const pflichtenheftExtractionSchema = z.object({
    mussCriteria: z.array(pflichtenheftCriterionSchema),
    kannCriteria: z.array(pflichtenheftCriterionSchema),
});

export const pflichtenheftExtractionJsonSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        mussCriteria: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                properties: {
                    title: { type: "string" },
                    description: { type: ["string", "null"] },
                    hints: { type: ["string", "null"] },
                    pages: {
                        type: "array",
                        items: { type: "number" },
                        minItems: 1,
                    },
                },
                required: ["title", "description", "hints", "pages"],
            },
        },
        kannCriteria: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                properties: {
                    title: { type: "string" },
                    description: { type: ["string", "null"] },
                    hints: { type: ["string", "null"] },
                    pages: {
                        type: "array",
                        items: { type: "number" },
                        minItems: 1,
                    },
                },
                required: ["title", "description", "hints", "pages"],
            },
        },
    },
    required: ["mussCriteria", "kannCriteria"],
} as const;

// Offer check schemas
export const offerCheckResultSchema = z.object({
    status: z.enum(["erfuellt", "nicht_erfuellt", "teilweise", "unklar"]),
    comment: z.string().nullable().optional(),
    citations: z.array(citationSchema),
    confidence: z.number().min(0).max(100).optional(),
});

export const offerCheckResultJsonSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        status: { enum: ["erfuellt", "nicht_erfuellt", "teilweise", "unklar"], type: "string" },
        comment: { type: ["string", "null"] },
        citations: {
            type: "array",
            items: citationJsonSchema,
        },
        confidence: { type: ["number", "null"] },
    },
    required: ["status", "comment", "citations", "confidence"],
} as const;
