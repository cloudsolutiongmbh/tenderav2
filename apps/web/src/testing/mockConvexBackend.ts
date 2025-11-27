import { getFunctionName } from "convex/server";

interface Project {
	_id: string;
	name: string;
	customer: string;
	tags: string[];
	projectType?: "standard" | "offerten";
	templateId?: string;
	latestRunId?: string;
	orgId: string;
	createdBy: string;
	createdAt: number;
}

interface DocumentRecord {
	_id: string;
	projectId: string;
	filename: string;
	mimeType: string;
	size: number;
	storageId: string;
	pageCount?: number;
	textExtracted: boolean;
	orgId: string;
	createdAt: number;
	updatedAt: number;
}

interface DocPageRecord {
	_id: string;
	documentId: string;
	page: number;
	text: string;
	orgId: string;
}

interface TemplateRecord {
	_id: string;
	name: string;
	description?: string;
	language: string;
	version: string;
	visibleOrgWide: boolean;
	criteria: Array<TemplateCriterion>;
	orgId: string;
	createdBy: string;
	updatedBy: string;
	createdAt: number;
	updatedAt: number;
}

interface TemplateCriterion {
	key: string;
	title: string;
	description?: string;
	hints?: string;
	answerType: "boolean" | "skala" | "text";
	weight: number;
	required: boolean;
	keywords?: string[];
}

interface AnalysisRunRecord {
	_id: string;
	projectId: string;
	type: "standard" | "criteria";
	status: "wartet" | "läuft" | "fertig" | "fehler";
	error?: string;
	queuedAt: number;
	startedAt?: number;
	finishedAt?: number;
	resultId?: string;
	provider?: string;
	model?: string;
	promptTokens?: number;
	completionTokens?: number;
	latencyMs?: number;
	orgId: string;
	createdBy: string;
	createdAt: number;
}

interface StandardResultSection {
	summary: string;
	milestones: Array<{
		title: string;
		date?: string;
		citation?: { page: number; quote: string };
	}>;
	requirements: Array<{
		title: string;
		category?: string;
		notes?: string;
		citation?: { page: number; quote: string };
	}>;
	metadata: Array<{
		label: string;
		value: string;
		citation?: { page: number; quote: string };
	}>;
}

interface CriteriaResultSection {
	templateId: string;
	items: Array<{
		criterionId: string;
		title: string;
		status: "gefunden" | "nicht_gefunden" | "teilweise";
		comment?: string;
		answer?: string;
		score?: number;
		weight: number;
		citations: Array<{ page: number; quote: string }>;
	}>;
}

interface AnalysisResultRecord {
	_id: string;
	projectId: string;
	runId: string;
	type: "standard" | "criteria";
	standard?: StandardResultSection;
	criteria?: CriteriaResultSection;
	orgId: string;
	createdAt: number;
}

interface ShareRecord {
	_id: string;
	projectId: string;
	token: string;
	expiresAt?: number;
	createdBy: string;
	orgId: string;
	createdAt: number;
}

interface CommentRecord {
	_id: string;
	projectId: string;
	text: string;
	createdBy: string;
	createdAt: number;
	orgId: string;
}

interface UploadPlaceholder {
	storageId: string;
	size: number;
}

interface BackendState {
	projects: Project[];
	templates: TemplateRecord[];
	documents: DocumentRecord[];
	docPages: DocPageRecord[];
	analysisRuns: AnalysisRunRecord[];
	analysisResults: AnalysisResultRecord[];
	shares: ShareRecord[];
	comments: CommentRecord[];
}

const ORG_ID = "test-org";
const USER_ID = "user-test";
const MAX_UPLOAD_MB = Number.parseInt(import.meta.env.VITE_MAX_UPLOAD_MB ?? "400");
const MAX_UPLOAD_BYTES = Number.isNaN(MAX_UPLOAD_MB)
	? 200 * 1024 * 1024
	: MAX_UPLOAD_MB * 1024 * 1024;

let counter = 0;
function generateId(prefix: string) {
	counter += 1;
	return `${prefix}_${counter}`;
}

function cloneState(state: BackendState): BackendState {
	return {
		projects: state.projects.map((p) => ({ ...p })),
		templates: state.templates.map((t) => ({ ...t, criteria: t.criteria.map((c) => ({ ...c })) })),
		documents: state.documents.map((d) => ({ ...d })),
		docPages: state.docPages.map((p) => ({ ...p })),
		analysisRuns: state.analysisRuns.map((r) => ({ ...r })),
		analysisResults: state.analysisResults.map((r) => ({ ...r, standard: r.standard ? structuredClone(r.standard) : undefined, criteria: r.criteria ? structuredClone(r.criteria) : undefined })),
		shares: state.shares.map((s) => ({ ...s })),
		comments: state.comments.map((c) => ({ ...c })),
	};
}

function extractSnippet(text: string) {
	const normalized = text.replace(/\s+/g, " ").trim();
	return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

class MockConvexBackend {
	private state: BackendState;
	private listeners = new Set<() => void>();
	private uploads = new Map<string, UploadPlaceholder>();

	constructor(initialState?: BackendState) {
		this.state = initialState ?? {
			projects: [],
			templates: [],
			documents: [],
			docPages: [],
			analysisRuns: [],
			analysisResults: [],
			shares: [],
			comments: [],
		};
	}

	subscribe(listener: () => void) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private notify() {
		for (const listener of this.listeners) {
			listener();
		}
	}

	reset() {
		this.state = {
			projects: [],
			templates: [],
			documents: [],
			docPages: [],
			analysisRuns: [],
			analysisResults: [],
			shares: [],
			comments: [],
		};
		this.uploads.clear();
		this.notify();
	}

	getState() {
		return cloneState(this.state);
	}

	loadState(snapshot: BackendState | null | undefined) {
		if (!snapshot) {
			return;
		}
		this.state = cloneState(snapshot);
		this.notify();
	}

	private projectById(projectId: string) {
		return this.state.projects.find((p) => p._id === projectId);
	}

	private templateById(templateId: string) {
		return this.state.templates.find((t) => t._id === templateId);
	}

	private runsByProject(projectId: string) {
		return this.state.analysisRuns.filter((run) => run.projectId === projectId);
	}

	private latestRun(projectId: string, type: "standard" | "criteria") {
		const runs = this.state.analysisRuns
			.filter((run) => run.projectId === projectId && run.type === type)
			.sort((a, b) => b.createdAt - a.createdAt);
		return runs[0];
	}

	private computeRuns(projectId: string) {
		const standard = this.latestRun(projectId, "standard");
		const criteria = this.latestRun(projectId, "criteria");
		return {
			standard: standard
				? {
					_id: standard._id,
					status: standard.status,
					createdAt: standard.createdAt,
					startedAt: standard.startedAt,
					finishedAt: standard.finishedAt,
				}
				: undefined,
			criteria: criteria
				? {
					_id: criteria._id,
					status: criteria.status,
					createdAt: criteria.createdAt,
					startedAt: criteria.startedAt,
					finishedAt: criteria.finishedAt,
				}
				: undefined,
		};
	}

	query(functionName: string, args: any) {
		switch (functionName) {
			case "projects:list": {
				const filter = (args?.filter as string | undefined)?.trim().toLowerCase();
				const filtered = filter
					? this.state.projects.filter((project) => {
						const nameMatch = project.name.toLowerCase().includes(filter);
						const tagMatch = project.tags.some((tag) => tag.toLowerCase().includes(filter));
						return nameMatch || tagMatch;
					})
					: this.state.projects;
				return filtered
					.sort((a, b) => b.createdAt - a.createdAt)
					.map((project) => ({ project, runs: this.computeRuns(project._id) }));
			}
			case "projects:get": {
				const project = this.projectById(args.projectId);
				if (!project) return undefined;
				return { project, runs: this.computeRuns(project._id) };
			}
			case "documents:listByProject": {
				return this.state.documents
					.filter((doc) => doc.projectId === args.projectId)
					.sort((a, b) => a.createdAt - b.createdAt);
			}
			case "analysis:getLatest": {
				const runs = this.state.analysisRuns
					.filter((run) => run.projectId === args.projectId && run.type === args.type)
					.sort((a, b) => b.createdAt - a.createdAt);
				const latest = runs[0];
				if (!latest) {
					return { run: null, result: null };
				}
				const result = latest.resultId
					? this.state.analysisResults.find((res) => res._id === latest.resultId)
					: undefined;
				return {
					run: latest,
					result: result ? (latest.type === "standard" ? result.standard : result.criteria) : null,
				};
			}
			case "templates:list": {
				return this.state.templates.slice().sort((a, b) => a.name.localeCompare(b.name));
			}
			case "templates:get": {
				return this.templateById(args.templateId);
			}
			case "shares:resolve": {
				const share = this.state.shares.find((item) => item.token === args.token);
				if (!share) return null;
				if (share.expiresAt && share.expiresAt < Date.now()) {
					return null;
				}
				const project = this.projectById(share.projectId);
				if (!project) return null;
				const standardRun = this.latestRun(project._id, "standard");
				const criteriaRun = this.latestRun(project._id, "criteria");
				const standardResult = standardRun?.resultId
					? this.state.analysisResults.find((res) => res._id === standardRun.resultId)
					: undefined;
				const criteriaResult = criteriaRun?.resultId
					? this.state.analysisResults.find((res) => res._id === criteriaRun.resultId)
					: undefined;
				return {
					share,
					project,
					standardResult: standardRun && standardResult
						? {
							run: standardRun,
							result: standardResult.standard,
						}
						: null,
					criteriaResult: criteriaRun && criteriaResult
						? {
							run: criteriaRun,
							result: criteriaResult.criteria,
						}
						: null,
				};
			}
			case "comments:listByProject": {
				return this.state.comments
					.filter((comment) => comment.projectId === args.projectId)
					.sort((a, b) => a.createdAt - b.createdAt);
			}
			default:
				throw new Error(`Unhandled query ${functionName}`);
		}
	}

	mutation(functionName: string, args: any) {
		switch (functionName) {
			case "projects:create": {
				const now = Date.now();
				const project: Project = {
					_id: generateId("project"),
					name: args.name,
					customer: args.customer,
					tags: args.tags ?? [],
					projectType: args.projectType ?? "standard",
					templateId: args.templateId,
					latestRunId: undefined,
					orgId: ORG_ID,
					createdBy: USER_ID,
					createdAt: now,
				};
				this.state.projects.push(project);
				this.notify();
				return project._id;
			}
			case "projects:setTemplate": {
				const project = this.projectById(args.projectId);
				if (!project) throw new Error("Projekt nicht gefunden");
				project.templateId = args.templateId ?? undefined;
				this.notify();
				return { success: true };
			}
			case "documents:createUploadUrl": {
				const storageId = generateId("storage");
				this.uploads.set(storageId, { storageId, size: 0 });
				return `mock-upload://${storageId}`;
			}
			case "documents:attach": {
				const project = this.projectById(args.projectId);
				if (!project) throw new Error("Projekt nicht gefunden");
				const existingTotal = this.state.documents
					.filter((doc) => doc.projectId === project._id)
					.reduce((sum, doc) => sum + doc.size, 0);
				if (existingTotal + args.size > MAX_UPLOAD_BYTES) {
					throw new Error("Maximale Gesamtgrösse überschritten.");
				}
				const now = Date.now();
				const document: DocumentRecord = {
					_id: generateId("document"),
					projectId: project._id,
					filename: args.filename,
					mimeType: args.mimeType,
					size: args.size,
					storageId: args.storageId,
					pageCount: undefined,
					textExtracted: false,
					role: args.role,
					orgId: ORG_ID,
					createdAt: now,
					updatedAt: now,
				};
				this.state.documents.push(document);
				this.notify();
				return document;
			}
			case "docPages:bulkInsert": {
				const document = this.state.documents.find((doc) => doc._id === args.documentId);
				if (!document) throw new Error("Dokument nicht gefunden");
				for (const page of args.pages ?? []) {
					const record: DocPageRecord = {
						_id: generateId("docPage"),
						documentId: document._id,
						page: page.page,
						text: page.text,
						orgId: ORG_ID,
					};
					this.state.docPages.push(record);
				}
				this.notify();
				return { inserted: args.pages?.length ?? 0 };
			}
			case "documents:markExtracted": {
				const document = this.state.documents.find((doc) => doc._id === args.documentId);
				if (!document) throw new Error("Dokument nicht gefunden");
				document.pageCount = args.pageCount;
				document.textExtracted = true;
				document.updatedAt = Date.now();
				this.notify();
				return { success: true };
			}
			case "projects:startAnalysis": {
				return this.startAnalysis(args.projectId, args.type);
			}
			case "templates:upsert": {
				const now = Date.now();
				if (args.templateId) {
					const existing = this.templateById(args.templateId);
					if (!existing) throw new Error("Template nicht gefunden");
					existing.name = args.name;
					existing.description = args.description;
					existing.language = args.language;
					existing.version = args.version;
					existing.visibleOrgWide = args.visibleOrgWide;
					existing.criteria = args.criteria.map((criterion: any, index: number) => ({
						...criterion,
						key: criterion.key || `${criterion.title}-${index + 1}`,
					}));
					existing.updatedAt = now;
					existing.updatedBy = USER_ID;
					this.notify();
					return existing._id;
				}
				const template: TemplateRecord = {
					_id: generateId("template"),
					name: args.name,
					description: args.description,
					language: args.language,
					version: args.version,
					visibleOrgWide: args.visibleOrgWide,
					criteria: args.criteria.map((criterion: any, index: number) => ({
						...criterion,
						key: criterion.key || `${criterion.title}-${index + 1}`,
					})),
					orgId: ORG_ID,
					createdBy: USER_ID,
					updatedBy: USER_ID,
					createdAt: now,
					updatedAt: now,
				};
				this.state.templates.push(template);
				this.notify();
				return template._id;
			}
			case "shares:create": {
				const project = this.projectById(args.projectId);
				if (!project) throw new Error("Projekt nicht gefunden");
				const now = Date.now();
				const token = generateId("share");
				const share: ShareRecord = {
					_id: generateId("shareDoc"),
					projectId: project._id,
					token,
					expiresAt: args.ttlDays ? now + args.ttlDays * 24 * 60 * 60 * 1000 : undefined,
					createdBy: USER_ID,
					orgId: ORG_ID,
					createdAt: now,
				};
				this.state.shares.push(share);
				this.notify();
				return { token, expiresAt: share.expiresAt };
			}
			case "comments:add": {
				const comment: CommentRecord = {
					_id: generateId("comment"),
					projectId: args.projectId,
					text: args.text,
					createdBy: USER_ID,
					createdAt: Date.now(),
					orgId: ORG_ID,
				};
				this.state.comments.push(comment);
				this.notify();
				return comment._id;
			}
			case "testHelpers:reset": {
				this.reset();
				return { success: true };
			}
			case "testHelpers:completeStandardRun": {
				this.completeStandardRun(args.projectId);
				return { success: true };
			}
			case "testHelpers:completeCriteriaRun": {
				this.completeCriteriaRun(args.projectId);
				return { success: true };
			}
			case "testHelpers:expireShare": {
				const share = this.state.shares.find((item) => item.token === args.token);
				if (share) {
					share.expiresAt = Date.now() - 1;
					this.notify();
				}
				return { success: true };
			}
			default:
				throw new Error(`Unhandled mutation ${functionName}`);
		}
	}

	private startAnalysis(projectId: string, type: "standard" | "criteria") {
		const project = this.projectById(projectId);
		if (!project) throw new Error("Projekt nicht gefunden");
		if (type === "criteria" && !project.templateId) {
			throw new Error("Für die Kriterien-Analyse muss ein Template gewählt sein.");
		}

		const activeRuns = this.state.analysisRuns.filter(
			(run) => run.orgId === ORG_ID && (run.status === "wartet" || run.status === "läuft"),
		);
		const maxActive = 1;
		const shouldStartImmediately = activeRuns.length < maxActive;
		const now = Date.now();
		const run: AnalysisRunRecord = {
			_id: generateId("run"),
			projectId,
			type,
			status: shouldStartImmediately ? "läuft" : "wartet",
			error: undefined,
			queuedAt: now,
			startedAt: shouldStartImmediately ? now : undefined,
			finishedAt: undefined,
			resultId: undefined,
			provider: shouldStartImmediately ? "PENDING" : "PENDING",
			model: shouldStartImmediately ? "PENDING" : "PENDING",
			promptTokens: undefined,
			completionTokens: undefined,
			latencyMs: undefined,
			orgId: ORG_ID,
			createdBy: USER_ID,
			createdAt: now,
		};
		this.state.analysisRuns.push(run);
		project.latestRunId = run._id;
		this.notify();
		return { runId: run._id, status: run.status };
	}

	private markRunFinished(run: AnalysisRunRecord, resultId: string) {
		run.status = "fertig";
		run.finishedAt = Date.now();
		run.resultId = resultId;
		run.provider = "TEST";
		run.model = run.type === "standard" ? "mock-standard" : "mock-criteria";
		run.promptTokens = 0;
		run.completionTokens = 0;
		run.latencyMs = 50;

		const queued = this.state.analysisRuns
			.filter((candidate) => candidate.orgId === ORG_ID && candidate.status === "wartet")
			.sort((a, b) => a.queuedAt - b.queuedAt)[0];
		if (queued) {
			queued.status = "läuft";
			queued.startedAt = Date.now();
		}
	}

	private completeStandardRun(projectId: string) {
		const project = this.projectById(projectId);
		if (!project) throw new Error("Projekt nicht gefunden");
		let run = this.latestRun(projectId, "standard");
		if (!run) {
			run = this.startAnalysis(projectId, "standard") as unknown as AnalysisRunRecord;
		}
		if (run.status === "wartet") {
			run.status = "läuft";
			run.startedAt = Date.now();
		}
		const pages = this.state.docPages
			.filter((page) => {
				const document = this.state.documents.find((doc) => doc._id === page.documentId);
				return document?.projectId === projectId;
			})
			.sort((a, b) => a.page - b.page);
		const citationPrimary = pages[0]
			? { page: pages[0].page, quote: extractSnippet(pages[0].text) }
			: { page: 1, quote: "Testinhalt" };
		const citationSecondary = pages[1]
			? { page: pages[1].page, quote: extractSnippet(pages[1].text) }
			: citationPrimary;

		const result: StandardResultSection = {
			summary:
				"Dieses Test-Ergebnis fasst die wichtigsten Inhalte der hochgeladenen Unterlagen zusammen und dient der Verifikation der UI.",
			milestones: [
				{ title: "Angebotsabgabe", date: "2025-03-01", citation: citationPrimary },
				{ title: "Fragenrunde", date: "2025-02-10", citation: citationSecondary },
			],
			requirements: [
				{ title: "Referenzen", category: "Qualitativ", notes: "Mindestens zwei Referenzen", citation: citationPrimary },
				{ title: "Sicherheitskonzept", category: "Organisatorisch", notes: "Konzept gemäss Ausschreibung", citation: citationSecondary },
			],
			metadata: [
				{ label: "Vergabestelle", value: "Testkommune", citation: citationSecondary },
				{ label: "Budget", value: "CHF 1'000'000", citation: citationPrimary },
			],
		};
		const resultRecord: AnalysisResultRecord = {
			_id: generateId("result"),
			projectId,
			runId: run._id,
			type: "standard",
			standard: result,
			criteria: undefined,
			orgId: ORG_ID,
			createdAt: Date.now(),
		};
		this.state.analysisResults.push(resultRecord);
		this.markRunFinished(run, resultRecord._id);
		this.notify();
	}

	private completeCriteriaRun(projectId: string) {
		const project = this.projectById(projectId);
		if (!project) throw new Error("Projekt nicht gefunden");
		if (!project.templateId) throw new Error("Projekt hat kein Template");
		let run = this.latestRun(projectId, "criteria");
		if (!run) {
			run = this.startAnalysis(projectId, "criteria") as unknown as AnalysisRunRecord;
		}
		if (run.status === "wartet") {
			run.status = "läuft";
			run.startedAt = Date.now();
		}
		const template = this.templateById(project.templateId);
		if (!template) throw new Error("Template nicht gefunden");
		const pages = this.state.docPages
			.filter((page) => {
				const document = this.state.documents.find((doc) => doc._id === page.documentId);
				return document?.projectId === projectId;
			})
			.sort((a, b) => a.page - b.page);
		const primary = pages[0]
			? { page: pages[0].page, quote: extractSnippet(pages[0].text) }
			: { page: 1, quote: "Testinhalt" };
		const secondary = pages[1]
			? { page: pages[1].page, quote: extractSnippet(pages[1].text) }
			: primary;

		const items = template.criteria.map((criterion, index) => {
			const status: "gefunden" | "nicht_gefunden" | "teilweise" =
				index % 2 === 0 ? "gefunden" : "nicht_gefunden";
			const citation = index % 2 === 0 ? primary : secondary;
			return {
				criterionId: criterion.key,
				title: criterion.title,
				status,
				comment:
					status === "gefunden"
						? "Kriterium wurde im Dokument bestätigt."
						: "Keine passenden Textstellen gefunden.",
				answer: status === "gefunden" ? "Ja" : "Nein",
				score: status === "gefunden" ? 1 : 0,
				weight: criterion.weight,
				citations: [citation],
			};
		});

		const resultRecord: AnalysisResultRecord = {
			_id: generateId("result"),
			projectId,
			runId: run._id,
			type: "criteria",
			criteria: {
				templateId: template._id,
				items,
			},
			standard: undefined,
			orgId: ORG_ID,
			createdAt: Date.now(),
		};
		this.state.analysisResults.push(resultRecord);
		this.markRunFinished(run, resultRecord._id);
		this.notify();
	}
}

const backend = new MockConvexBackend(
	typeof window !== "undefined" && (window as any).__mockConvexInitialState
		? (window as any).__mockConvexInitialState
		: undefined,
);

if (typeof window !== "undefined") {
	const anyWindow = window as any;
	anyWindow.__mockConvex = {
		reset: () => backend.reset(),
		getState: () => backend.getState(),
		loadState: (snapshot: BackendState) => backend.loadState(snapshot),
		seedTemplate: (
			template: Omit<TemplateRecord, "_id" | "orgId" | "createdBy" | "updatedBy" | "createdAt" | "updatedAt">,
		) =>
			backend.mutation("templates:upsert", {
				templateId: undefined,
				...template,
			}),
		startStandard: (projectId: string) => backend.mutation("projects:startAnalysis", { projectId, type: "standard" }),
		startCriteria: (projectId: string) => backend.mutation("projects:startAnalysis", { projectId, type: "criteria" }),
		completeStandardRun: (projectId: string) => backend.mutation("testHelpers:completeStandardRun", { projectId }),
		completeCriteriaRun: (projectId: string) => backend.mutation("testHelpers:completeCriteriaRun", { projectId }),
		expireShare: (token: string) => backend.mutation("testHelpers:expireShare", { token }),
		snapshot: () => backend.getState(),
	};

	if (!anyWindow.__mockUploadPatched) {
		const originalFetch = window.fetch.bind(window);
		window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
			if (url.startsWith("mock-upload://")) {
				return new Response(JSON.stringify({ storageId: url.replace("mock-upload://", "") }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}
			return originalFetch(input, init);
		};
		anyWindow.__mockUploadPatched = true;
	}
}

export function getMockBackend() {
	return backend;
}

export function getFunctionNameFromReference(reference: any) {
	try {
		return getFunctionName(reference as any);
	} catch (error) {
		throw new Error(`Ungültige Funktionsreferenz: ${String(error)}`);
	}
}

export type { BackendState };
