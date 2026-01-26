import { useMemo, useState, useCallback } from "react";

import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@tendera/backend/convex/_generated/api";
import { StatusBadge } from "@/components/status-badge";
import { AuthStateNotice } from "@/components/auth-state-notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UploadDropzone } from "@/components/upload-dropzone";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	DialogClose,
} from "@/components/ui/dialog";
import { useOrgAuth } from "@/hooks/useOrgAuth";
import { Grid3x3, List, Trash2, Search, X } from "lucide-react";

import { extractDocumentPages } from "@/lib/extract-text";
import type { Id } from "@tendera/backend/convex/_generated/dataModel";

const MAX_UPLOAD_MB = Number.parseInt(import.meta.env.VITE_MAX_UPLOAD_MB ?? "400", 10);

interface TemplateOption {
	_id: string;
	name: string;
}

interface RunSummary {
	_id: string;
	status: "wartet" | "läuft" | "fertig" | "fehler";
	createdAt: number;
	startedAt?: number;
	finishedAt?: number;
}

interface ListedProject {
	project: {
		_id: string;
		name: string;
		customer: string;
		tags: string[];
		projectType?: "standard" | "offerten";
		createdAt: number;
	};
	runs?: {
		standard?: RunSummary;
		criteria?: RunSummary;
		pflichtenheft_extract?: RunSummary;
		offer_check?: RunSummary;
	};
}

export const Route = createFileRoute("/projekte")({
	component: ProjektePage,
});

function ProjektePage() {
	const [isDialogOpen, setDialogOpen] = useState(false);
	const [viewMode, setViewMode] = useState<"board" | "list">("board");
	const [searchQuery, setSearchQuery] = useState("");
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const isIndex = pathname === "/projekte";
	const auth = useOrgAuth();
	const allProjects = useQuery(
		api.projects.list,
		auth.authReady ? { filter: undefined } : "skip",
	) as ListedProject[] | undefined;
	const templates = useQuery(
		api.templates.list,
		auth.authReady ? undefined : "skip",
	) as TemplateOption[] | undefined;
	const deleteProject = useMutation(api.projects.remove);

	const templateOptions = useMemo(() => templates ?? [], [templates]);

	const projects = useMemo(() => {
		if (!allProjects) return allProjects;
		if (!searchQuery.trim()) return allProjects;

		const query = searchQuery.toLowerCase().trim();
		return allProjects.filter(({ project }) => {
			return (
				project.name.toLowerCase().includes(query) ||
				project.customer.toLowerCase().includes(query) ||
				project.tags.some(tag => tag.toLowerCase().includes(query))
			);
		});
	}, [allProjects, searchQuery]);

	if (auth.orgStatus !== "ready") {
		return <AuthStateNotice status={auth.orgStatus} />;
	}

	if (!isIndex) {
		return <Outlet />;
	}

	const handleDelete = async (projectId: string, projectName: string) => {
		if (!confirm(`Projekt "${projectName}" wirklich löschen? Alle Analysen und Dokumente werden ebenfalls gelöscht.`)) {
			return;
		}
		try {
			await deleteProject({ projectId: projectId as Id<"projects"> });
			toast.success("Projekt gelöscht.");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Projekt konnte nicht gelöscht werden.");
		}
	};

	return (
		<div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-6 px-4 py-10">
			<Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
				<header className="space-y-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<h1 className="text-3xl font-semibold">Projekte</h1>
							<p className="text-muted-foreground">
								Verwalte Ausschreibungen, lade Unterlagen hoch und starte Analysen.
							</p>
						</div>
						<div className="flex items-center gap-2">
							<div className="flex rounded-md border">
								<Button
									variant={viewMode === "board" ? "default" : "ghost"}
									size="sm"
									onClick={() => setViewMode("board")}
									className="rounded-r-none"
								>
									<Grid3x3 className="h-4 w-4" />
								</Button>
								<Button
									variant={viewMode === "list" ? "default" : "ghost"}
									size="sm"
									onClick={() => setViewMode("list")}
									className="rounded-l-none"
								>
									<List className="h-4 w-4" />
								</Button>
							</div>
							<DialogTrigger asChild>
								<Button>Neues Projekt</Button>
							</DialogTrigger>
						</div>
					</div>
					<div className="relative">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							placeholder="Projekte durchsuchen..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-9"
						/>
					</div>
				</header>

				<DialogContent>
					<DialogHeader>
						<DialogTitle>Neues Projekt anlegen</DialogTitle>
						<DialogDescription>
							Erfasse Stammdaten und lade die ersten Dokumente direkt hoch – Analysen starten im Anschluss automatisch.
						</DialogDescription>
					</DialogHeader>
					<NewProjectForm
						templates={templateOptions}
						onSuccess={() => setDialogOpen(false)}
					/>
				</DialogContent>
			</Dialog>

			<section className={viewMode === "board" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "flex flex-col gap-2"}>
				{projects === undefined ? (
					<ProjectSkeleton />
				) : projects.length === 0 ? (
					<Card>
						<CardContent className="py-8 text-center text-sm text-muted-foreground">
							Noch keine Projekte vorhanden. Lege ein Projekt an, um zu starten.
						</CardContent>
					</Card>
				) : viewMode === "board" ? (
					projects.map(({ project, runs }) => {
						const latestRun = getLatestRun(runs);
						const latestStatus = latestRun?.status ?? "bereit";
						const latestType = getRunLabel(runs, latestRun?._id);
						const updatedAt = formatDate(
							getLastActivity(project.createdAt, runs),
						);
						const tagLine = project.tags.length > 0 ? project.tags.join(", ") : "Keine Tags";
						const isOfferten = project.projectType === "offerten";
						const mainRoute = isOfferten ? "/projekte/$id/offerten" : "/projekte/$id/standard";

						return (
							<Link
								to={mainRoute}
								params={{ id: project._id }}
								key={project._id}
								className="block"
							>
								<Card className="group relative cursor-pointer transition-shadow hover:shadow-md">
								<CardHeader className="space-y-3">
									<div className="flex items-start justify-between gap-2">
										<div className="space-y-1 min-w-0 flex-1">
											<CardTitle className="text-lg font-semibold">{project.name}</CardTitle>
											<CardDescription className="space-y-1 text-xs">
												<p>{project.customer}</p>
												<p className="text-muted-foreground">
													{tagLine} · Aktualisiert am {updatedAt}
												</p>
											</CardDescription>
										</div>
										<Button
											variant="ghost"
											size="sm"
											onClick={(e) => {
												e.preventDefault();
												handleDelete(project._id, project.name);
											}}
											className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 flex-shrink-0"
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</div>
									<div className="flex items-center gap-2">
										<StatusBadge status={latestStatus} />
										<span className="text-xs text-muted-foreground">{latestType}</span>
									</div>
								</CardHeader>
								<CardContent className="grid grid-cols-2 gap-2" onClick={(e) => e.preventDefault()}>
									<button
										onClick={(e) => {
											e.preventDefault();
											navigate({
												to: "/projekte/$id/standard",
												params: { id: project._id },
											});
										}}
										className="rounded-md border px-3 py-2 text-sm text-center transition-colors hover:bg-muted"
									>
										Standard-Ansicht
									</button>
									<button
										onClick={(e) => {
											e.preventDefault();
											navigate({
												to: "/projekte/$id/kriterien",
												params: { id: project._id },
											});
										}}
										className="rounded-md border px-3 py-2 text-sm text-center transition-colors hover:bg-muted"
									>
										Kriterien-Ansicht
									</button>
									<button
										onClick={(e) => {
											e.preventDefault();
											navigate({
												to: "/projekte/$id/dokumente",
												params: { id: project._id },
											});
										}}
										className="rounded-md border px-3 py-2 text-sm text-center transition-colors hover:bg-muted"
									>
										Dokumente
									</button>
									<button
										onClick={(e) => {
											e.preventDefault();
											navigate({
												to: "/projekte/$id/kommentare",
												params: { id: project._id },
											});
										}}
										className="rounded-md border px-3 py-2 text-sm text-center transition-colors hover:bg-muted"
									>
										Kommentare
									</button>
									<button
										onClick={(e) => {
											e.preventDefault();
											navigate({
												to: "/projekte/$id/export",
												params: { id: project._id },
											});
										}}
										className="rounded-md border px-3 py-2 text-sm text-center transition-colors hover:bg-muted col-span-2"
									>
										Export
									</button>
								</CardContent>
							</Card>
							</Link>
						);
					})
				) : (
					projects.map(({ project, runs }) => {
						const latestRun = getLatestRun(runs);
						const latestStatus = latestRun?.status ?? "bereit";
						const latestType = getRunLabel(runs, latestRun?._id);
						const updatedAt = formatDate(
							getLastActivity(project.createdAt, runs),
						);
						const tagLine = project.tags.length > 0 ? project.tags.join(", ") : "Keine Tags";
						const isOfferten = project.projectType === "offerten";
						const mainRoute = isOfferten ? "/projekte/$id/offerten" : "/projekte/$id/standard";

						return (
							<Link
								to={mainRoute}
								params={{ id: project._id }}
								key={project._id}
								className="block"
							>
								<Card className="group relative cursor-pointer transition-shadow hover:shadow-md">
								<CardHeader className="flex flex-row items-center justify-between py-3">
									<div className="flex flex-1 items-center gap-4">
										<div className="flex-1">
											<CardTitle className="text-base">{project.name}</CardTitle>
											<CardDescription className="text-xs">
												{project.customer} · {tagLine}
											</CardDescription>
										</div>
										<div className="flex flex-col items-end gap-1">
											<StatusBadge status={latestStatus} />
											<span className="text-xs text-muted-foreground">{latestType}</span>
										</div>
										<span className="text-xs text-muted-foreground">
											{updatedAt}
										</span>
										<div className="flex gap-2">
											<button
												onClick={(e) => {
													e.preventDefault();
													navigate({
														to: "/projekte/$id/standard",
														params: { id: project._id },
													});
												}}
												className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
											>
												Standard
											</button>
											<button
												onClick={(e) => {
													e.preventDefault();
													navigate({
														to: "/projekte/$id/kriterien",
														params: { id: project._id },
													});
												}}
												className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
											>
												Kriterien
											</button>
											<button
												onClick={(e) => {
													e.preventDefault();
													navigate({
														to: "/projekte/$id/dokumente",
														params: { id: project._id },
													});
												}}
												className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
											>
												Docs
											</button>
										</div>
										<Button
											variant="ghost"
											size="sm"
											onClick={(e) => {
												e.preventDefault();
												handleDelete(project._id, project.name);
											}}
											className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</div>
								</CardHeader>
							</Card>
							</Link>
						);
					})
				)}
			</section>
		</div>
	);
}

interface NewProjectFormProps {
	templates: TemplateOption[];
	onSuccess: () => void;
}

function NewProjectForm({ templates, onSuccess }: NewProjectFormProps) {
	const createProject = useMutation(api.projects.create);
	const startAnalysis = useMutation(api.projects.startAnalysis);
	const createUploadUrl = useMutation(api.documents.createUploadUrl);
	const attachDocument = useMutation(api.documents.attach);
	const bulkInsertPages = useMutation(api.docPages.bulkInsert);
	const markDocumentExtracted = useMutation(api.documents.markExtracted);
	const ensureOfferFromDocument = useMutation(api.offers.ensureFromDocument);
	const runStandardForProject = useAction(api.analysis.runStandardForProject);
	const runCriteriaForProject = useAction(api.analysis.runCriteriaForProject);
	const extractPflichtenheftCriteria = useAction(api.analysis.extractPflichtenheftCriteria);

	const [isSubmitting, setSubmitting] = useState(false);
	const [name, setName] = useState("");
	const [customer, setCustomer] = useState("");
	const [tags, setTags] = useState("");
	const [projectType, setProjectType] = useState<"standard" | "offerten">("standard");
	const [templateId, setTemplateId] = useState<string>("");
	const [standardFiles, setStandardFiles] = useState<File[]>([]);
	const [pflichtenheftFile, setPflichtenheftFile] = useState<File | null>(null);
	const [offerFiles, setOfferFiles] = useState<File[]>([]);

	const templateOptions = useMemo(() => templates, [templates]);
	const standardBytes = useMemo(
		() => standardFiles.reduce((sum, file) => sum + file.size, 0),
		[standardFiles],
	);
	const offerBytes = useMemo(
		() => offerFiles.reduce((sum, file) => sum + file.size, 0),
		[offerFiles],
	);
	const pflichtenheftBytes = pflichtenheftFile?.size ?? 0;

	const handleProjectTypeChange = useCallback(
		(event: React.ChangeEvent<HTMLSelectElement>) => {
			const nextType = event.target.value as "standard" | "offerten";
			setProjectType(nextType);
			if (nextType === "standard") {
				setPflichtenheftFile(null);
				setOfferFiles([]);
			} else {
				setStandardFiles([]);
			}
		},
		[],
	);

	const handleStandardAccepted = useCallback((files: File[]) => {
		setStandardFiles((previous) => [...previous, ...files]);
	}, []);

	const handlePflichtenheftAccepted = useCallback((files: File[]) => {
		const [file] = files;
		if (file) {
			setPflichtenheftFile(file);
		}
	}, []);

	const handleOfferAccepted = useCallback((files: File[]) => {
		setOfferFiles((previous) => [...previous, ...files]);
	}, []);

	const removeStandardFile = useCallback((index: number) => {
		setStandardFiles((previous) => previous.filter((_, i) => i !== index));
	}, []);

	const removeOfferFile = useCallback((index: number) => {
		setOfferFiles((previous) => previous.filter((_, i) => i !== index));
	}, []);

	const clearPflichtenheftFile = useCallback(() => {
		setPflichtenheftFile(null);
	}, []);

	const uploadAndExtract = useCallback(
		async (
			projectId: string,
			file: File,
			options: { role?: "pflichtenheft" | "offer" | "support" } = {},
		) => {
			const uploadUrl = await createUploadUrl();
			const response = await fetch(uploadUrl, {
				method: "POST",
				headers: {
					"Content-Type": file.type || "application/octet-stream",
				},
				body: file,
			});

			const json = (await response.json()) as { storageId?: string };
			if (!response.ok || !json.storageId) {
				throw new Error("Upload fehlgeschlagen.");
			}

			const attached = await attachDocument({
				projectId: projectId as Id<"projects">,
				filename: file.name,
				mimeType: file.type || "application/octet-stream",
				size: file.size,
				storageId: json.storageId as Id<"_storage">,
				role: options.role,
			});

			const pages = await extractDocumentPages(file);
			if (pages.length > 0) {
				await bulkInsertPages({
					documentId: attached?._id as Id<"documents">,
					pages: pages.map((page) => ({ page: page.page, text: page.text })),
				});
				await markDocumentExtracted({
					documentId: attached?._id as Id<"documents">,
					pageCount: pages.length,
				});
			} else {
				await markDocumentExtracted({ documentId: attached?._id as Id<"documents">, pageCount: 0 });
			}

			return attached;
		},
		[attachDocument, bulkInsertPages, createUploadUrl, markDocumentExtracted],
	);

	const triggerAnalysis = useCallback(
		async (projectId: string, type: "standard" | "criteria") => {
			try {
				const res = (await startAnalysis({ projectId: projectId as Id<"projects">, type })) as
					| { status: "läuft" | "wartet"; runId: string }
					| undefined;
				const label = type === "standard" ? "Standard-Analyse" : "Kriterien-Analyse";
				if (!res) {
					return;
				}
				if (res.status === "läuft") {
					if (type === "standard") {
						await runStandardForProject({ projectId: projectId as Id<"projects"> });
					} else {
						await runCriteriaForProject({ projectId: projectId as Id<"projects"> });
					}
					toast.success(`${label} gestartet.`);
				} else {
					toast.info(`${label} wurde in die Warteschlange gestellt.`);
				}
			} catch (error) {
				console.error(error);
				toast.error(
					error instanceof Error
						? error.message
						: "Analyse konnte nicht gestartet werden.",
				);
			}
		},
		[runCriteriaForProject, runStandardForProject, startAnalysis],
	);

	const triggerPflichtenheftExtraction = useCallback(
		async (projectId: string) => {
			try {
				const result = await extractPflichtenheftCriteria({ projectId: projectId as Id<"projects"> });
				if (result?.criteriaCount) {
					toast.success(`Kriterien extrahiert (${result.criteriaCount}).`);
				} else {
					toast.success("Kriterienextraktion gestartet.");
				}
			} catch (error) {
				console.error(error);
				toast.error(
					error instanceof Error
						? error.message
						: "Kriterien konnten nicht extrahiert werden.",
				);
			}
		},
		[extractPflichtenheftCriteria],
	);

	const resetForm = useCallback(() => {
		setName("");
		setCustomer("");
		setTags("");
		setProjectType("standard");
		setTemplateId("");
		setStandardFiles([]);
		setPflichtenheftFile(null);
		setOfferFiles([]);
	}, []);

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setSubmitting(true);
		try {
			const normalizedTags = tags
				.split(",")
				.map((tag) => tag.trim())
				.filter(Boolean);

			const projectId = (await createProject({
				name,
				customer,
				tags: normalizedTags,
				projectType,
				templateId: templateId ? (templateId as Id<"templates">) : undefined,
			})) as string | undefined;

			if (!projectId) {
				throw new Error("Projekt konnte nicht erstellt werden.");
			}

			if (projectType === "standard" && standardFiles.length > 0) {
				toast.info("Dokumente werden hochgeladen …");
				for (const file of standardFiles) {
					await uploadAndExtract(projectId, file);
				}
				await triggerAnalysis(projectId, "standard");
				if (templateId) {
					await triggerAnalysis(projectId, "criteria");
				}
			}

                        if (projectType === "offerten") {
                                if (pflichtenheftFile) {
                                        toast.info("Pflichtenheft wird hochgeladen …");
                                        await uploadAndExtract(projectId, pflichtenheftFile, { role: "pflichtenheft" });
                                        toast.info("Kriterien-Extraktion wird gestartet …");
                                        void triggerPflichtenheftExtraction(projectId);
                                }
				if (offerFiles.length > 0) {
					toast.info("Angebotsdokumente werden hochgeladen …");
					for (const file of offerFiles) {
						const document = await uploadAndExtract(projectId, file, { role: "offer" });
						if (document?._id) {
							try {
								await ensureOfferFromDocument({
									projectId: projectId as Id<"projects">,
									documentId: document._id as Id<"documents">,
								});
							} catch (error) {
								console.error(error);
								toast.error(
									error instanceof Error
										? error.message
										: "Angebot konnte nicht erstellt werden.",
								);
							}
						}
					}
				}
			}

			toast.success("Projekt angelegt. Alle Uploads abgeschlossen.");
			resetForm();
			onSuccess();
		} catch (error) {
			console.error(error);
			toast.error(error instanceof Error ? error.message : "Projekt konnte nicht erstellt werden.");
		} finally {
			setSubmitting(false);
		}
	};

        return (
                <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
                        <Input
                                placeholder="Projektname"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                required
                                disabled={isSubmitting}
                                className="md:col-span-1"
                        />
                        <Input
                                placeholder="Kunde/Behörde"
                                value={customer}
                                onChange={(event) => setCustomer(event.target.value)}
                                required
                                disabled={isSubmitting}
                                className="md:col-span-1"
                        />
                        <Input
                                placeholder="Interne Tags (Komma-getrennt)"
                                value={tags}
                                onChange={(event) => setTags(event.target.value)}
                                disabled={isSubmitting}
                                className="md:col-span-2"
                        />
			<div className="space-y-2 md:col-span-2">
				<label className="text-sm font-medium" htmlFor="project-type">
					Projekt-Typ
				</label>
				<select
					id="project-type"
					className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
					value={projectType}
					onChange={handleProjectTypeChange}
					disabled={isSubmitting}
				>
					<option value="standard">Standard-Analyse</option>
					<option value="offerten">Offerten-Vergleich</option>
				</select>
				<p className="text-xs text-muted-foreground">
					{projectType === "standard"
						? "Analysiere ein einzelnes Dokument mit Standard- und optionaler Kriterien-Analyse."
						: "Vergleiche Angebote gegen ein Pflichtenheft. Du kannst Dokumente direkt hier hochladen."}
				</p>
			</div>
                        {projectType === "standard" ? (
                                <div className="space-y-3 md:col-span-2">
					<label className="text-sm font-medium" htmlFor="project-template">
						Kriterienkatalog (optional)
					</label>
					<select
						id="project-template"
						className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
						value={templateId}
						onChange={(event) => setTemplateId(event.target.value)}
						disabled={isSubmitting}
					>
						<option value="">Optionalen Kriterienkatalog auswählen</option>
						{templateOptions.map((template) => (
							<option key={template._id} value={template._id}>
								{template.name}
							</option>
						))}
					</select>
					<div className="space-y-2">
						<p className="text-sm font-medium">Dokumente für die Analyse</p>
						<UploadDropzone
							onFilesAccepted={handleStandardAccepted}
							currentTotalBytes={standardBytes}
							maxTotalSizeMb={MAX_UPLOAD_MB}
							disabled={isSubmitting}
						/>
						{standardFiles.length > 0 ? (
							<ul className="space-y-1 text-sm">
								{standardFiles.map((file, index) => (
									<li
										key={`${file.name}-${index}`}
										className="flex items-center justify-between rounded-md border px-3 py-2"
									>
										<span className="truncate pr-3">{file.name}</span>
									<Button
										type="button"
										variant="ghost"
										size="icon"
											onClick={() => removeStandardFile(index)}
											disabled={isSubmitting}
										>
											<X className="h-4 w-4" />
										</Button>
									</li>
								))}
							</ul>
						) : (
							<p className="text-xs text-muted-foreground">
								Optional: Lade das Pflichtenheft oder die Ausschreibungsunterlagen direkt hoch.
							</p>
						)}
					</div>
				</div>
			) : (
                                <div className="space-y-6 md:col-span-2 md:grid md:grid-cols-2 md:gap-6">
                                        <div className="space-y-2">
						<p className="text-sm font-medium">Pflichtenheft (1 Datei)</p>
						<UploadDropzone
							onFilesAccepted={handlePflichtenheftAccepted}
							currentTotalBytes={pflichtenheftBytes}
							maxFiles={1}
							maxTotalSizeMb={MAX_UPLOAD_MB}
							disabled={isSubmitting}
						/>
						{pflichtenheftFile ? (
							<div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
								<span className="truncate pr-3">{pflichtenheftFile.name}</span>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									onClick={clearPflichtenheftFile}
									disabled={isSubmitting}
								>
									<X className="h-4 w-4" />
								</Button>
							</div>
						) : (
							<p className="text-xs text-muted-foreground">
								Empfehlung: Lade das Pflichtenheft direkt mit hoch, um die Kriterien automatisch zu extrahieren.
							</p>
						)}
					</div>
                                        <div className="space-y-2">
						<p className="text-sm font-medium">Angebote (mehrere Dateien möglich)</p>
						<UploadDropzone
							onFilesAccepted={handleOfferAccepted}
							currentTotalBytes={offerBytes}
							maxTotalSizeMb={MAX_UPLOAD_MB}
							disabled={isSubmitting}
						/>
						{offerFiles.length > 0 ? (
							<ul className="space-y-1 text-sm">
								{offerFiles.map((file, index) => (
									<li
										key={`${file.name}-${index}`}
										className="flex items-center justify-between rounded-md border px-3 py-2"
									>
										<span className="truncate pr-3">{file.name}</span>
									<Button
										type="button"
										variant="ghost"
										size="icon"
											onClick={() => removeOfferFile(index)}
											disabled={isSubmitting}
										>
											<X className="h-4 w-4" />
										</Button>
									</li>
								))}
							</ul>
						) : (
							<p className="text-xs text-muted-foreground">
								Optional: Lade Angebotsunterlagen hoch, wir erstellen automatisch Angebotsdatensätze.
							</p>
						)}
					</div>
				</div>
			)}
                        <DialogFooter className="md:col-span-2">
				<DialogClose asChild>
					<Button type="button" variant="outline" disabled={isSubmitting}>
						Abbrechen
					</Button>
				</DialogClose>
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? "Speichere …" : "Projekt anlegen"}
				</Button>
			</DialogFooter>
		</form>
	);
}

function ProjectSkeleton() {
	return (
		<Card>
			<CardContent className="space-y-3 p-6">
				<div className="h-5 w-1/2 rounded bg-muted" />
				<div className="h-4 w-3/4 rounded bg-muted" />
				<div className="h-9 w-full rounded bg-muted" />
			</CardContent>
		</Card>
	);
}

function getLatestRun(runs?: ListedProject["runs"] | null) {
	if (!runs) {
		return null;
	}

	const candidates = [
		runs.standard,
		runs.criteria,
		runs.pflichtenheft_extract,
		runs.offer_check,
	].filter(Boolean) as RunSummary[];
	if (candidates.length === 0) {
		return null;
	}

	return candidates.reduce((latest, current) =>
		current.createdAt > latest.createdAt ? current : latest,
	);
}

function getRunLabel(runs: ListedProject["runs"] | undefined, runId?: string) {
	if (!runId || !runs) {
		return "Noch keine Analyse";
	}
	if (runs.standard && runs.standard._id === runId) {
		return "Letzte Analyse: Standard";
	}
	if (runs.criteria && runs.criteria._id === runId) {
		return "Letzte Analyse: Kriterien";
	}
	if (runs.pflichtenheft_extract && runs.pflichtenheft_extract._id === runId) {
		return "Letzte Analyse: Pflichtenheft-Extraktion";
	}
	if (runs.offer_check && runs.offer_check._id === runId) {
		return "Letzte Analyse: Angebotsvergleich";
	}
	return "Letzte Analyse";
}

function getLastActivity(createdAt: number, runs?: ListedProject["runs"]) {
	const timestamps = [createdAt];
	if (runs?.standard) {
		timestamps.push(runs.standard.finishedAt ?? runs.standard.startedAt ?? runs.standard.createdAt);
	}
	if (runs?.criteria) {
		timestamps.push(runs.criteria.finishedAt ?? runs.criteria.startedAt ?? runs.criteria.createdAt);
	}
	if (runs?.pflichtenheft_extract) {
		timestamps.push(
			runs.pflichtenheft_extract.finishedAt
				?? runs.pflichtenheft_extract.startedAt
				?? runs.pflichtenheft_extract.createdAt,
		);
	}
	if (runs?.offer_check) {
		timestamps.push(
			runs.offer_check.finishedAt
				?? runs.offer_check.startedAt
				?? runs.offer_check.createdAt,
		);
	}
	return Math.max(...timestamps);
}

function formatDate(timestamp: number) {
	return new Date(timestamp).toLocaleDateString("de-CH", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	});
}
