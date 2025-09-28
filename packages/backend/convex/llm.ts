import { ConvexError } from "convex/values";

type SupportedProvider = "OPENAI" | "ANTHROPIC";

interface LlmCallArgs {
	systemPrompt: string;
	userPrompt: string;
	temperature?: number;
	maxOutputTokens?: number;
}

export interface LlmCallResult {
	text: string;
	usage: {
		promptTokens?: number;
		completionTokens?: number;
	};
	latencyMs: number;
	provider: SupportedProvider;
	model: string;
}

export function getConfiguredModel(): { provider: SupportedProvider; model: string } {
	const provider = process.env.LLM_PROVIDER as SupportedProvider | undefined;
	const model = process.env.LLM_MODEL;

	if (!provider) {
		throw new ConvexError(
			"LLM_PROVIDER ist nicht gesetzt. Bitte eine gültige Option (OPENAI oder ANTHROPIC) konfigurieren.",
		);
	}

	if (!model) {
		throw new ConvexError("LLM_MODEL ist nicht gesetzt. Bitte ein Modell konfigurieren.");
	}

	if (provider !== "OPENAI" && provider !== "ANTHROPIC") {
		throw new ConvexError("LLM_PROVIDER muss OPENAI oder ANTHROPIC sein.");
	}

	return { provider, model };
}

export async function callLlm(args: LlmCallArgs): Promise<LlmCallResult> {
	const { provider, model } = getConfiguredModel();
	switch (provider) {
		case "OPENAI":
			return await callOpenAi(model, args);
		case "ANTHROPIC":
			return await callAnthropic(model, args);
		default:
			throw new ConvexError("Nicht unterstützter LLM-Provider.");
	}
}

function shouldUseResponsesApi(model: string) {
  // Heuristic: GPT‑5 models and some newer families expect the Responses API
  return /^gpt-5/i.test(model);
}

async function callOpenAi(model: string, args: LlmCallArgs): Promise<LlmCallResult> {
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		throw new ConvexError("OPENAI_API_KEY fehlt.");
	}

	const start = Date.now();
	let latencyMs = 0;

    if (shouldUseResponsesApi(model)) {
        // Newer OpenAI models (e.g., GPT‑5) use the Responses API.
        // - Use `instructions` for system prompt
        // - Use `input` for user content
        // - Use `text.format` instead of `response_format`
        const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model,
                instructions: args.systemPrompt,
                input: args.userPrompt,
                temperature: args.temperature ?? 0,
                // Some newer models expect max_completion_tokens (not max_tokens)
                max_completion_tokens: args.maxOutputTokens ?? 2000,
                text: { format: { type: "json_object" } },
            }),
        });

		latencyMs = Date.now() - start;
		const data = await response.json();
		if (!response.ok) {
			const message = data?.error?.message ?? "OpenAI-Anfrage fehlgeschlagen.";
			throw new ConvexError(message);
		}

		// Responses API: prefer `output_text`, otherwise stitch text from content
		let text: string = data?.output_text ?? "";
		if (!text && Array.isArray(data?.output)) {
			const parts: string[] = [];
			for (const turn of data.output) {
				if (Array.isArray(turn?.content)) {
					for (const c of turn.content) {
						if (typeof c?.text === "string") parts.push(c.text);
					}
				}
			}
			text = parts.join("\n");
		}

		return {
			text,
			usage: {
				promptTokens: data?.usage?.input_tokens,
				completionTokens: data?.usage?.output_tokens,
			},
			latencyMs,
			provider: "OPENAI",
			model,
		};
	}

	// Legacy Chat Completions API
	const response = await fetch("https://api.openai.com/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model,
			messages: [
				{ role: "system", content: args.systemPrompt },
				{ role: "user", content: args.userPrompt },
			],
			temperature: args.temperature ?? 0,
			max_tokens: args.maxOutputTokens ?? 2000,
			response_format: { type: "json_object" },
		}),
	});

	latencyMs = Date.now() - start;
	const data = await response.json();
	if (!response.ok) {
		const message = data?.error?.message ?? "OpenAI-Anfrage fehlgeschlagen.";
		throw new ConvexError(message);
	}

	const content = data?.choices?.[0]?.message?.content ?? "";
	return {
		text: typeof content === "string" ? content : JSON.stringify(content),
		usage: {
			promptTokens: data?.usage?.prompt_tokens,
			completionTokens: data?.usage?.completion_tokens,
		},
		latencyMs,
		provider: "OPENAI",
		model,
	};
}

async function callAnthropic(model: string, args: LlmCallArgs): Promise<LlmCallResult> {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		throw new ConvexError("ANTHROPIC_API_KEY fehlt.");
	}

	const start = Date.now();
	const response = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify({
			model,
			system: args.systemPrompt,
			messages: [
				{ role: "user", content: args.userPrompt },
			],
			max_tokens: args.maxOutputTokens ?? 2000,
			temperature: args.temperature ?? 0,
		}),
	});

	const latencyMs = Date.now() - start;
	const data = await response.json();

	if (!response.ok) {
		const message = data?.error?.message ?? "Anthropic-Anfrage fehlgeschlagen.";
		throw new ConvexError(message);
	}

	const content = Array.isArray(data?.content)
		? data.content
			.filter((item: any) => item.type === "text")
			.map((item: any) => item.text)
			.join("\n")
		: "";

	return {
		text: content,
		usage: {
			promptTokens: data?.usage?.input_tokens,
			completionTokens: data?.usage?.output_tokens,
		},
		latencyMs,
		provider: "ANTHROPIC",
		model,
	};
}
