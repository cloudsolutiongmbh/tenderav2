import { type ReactNode, useEffect, useMemo, useState } from "react";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@tendera/backend/convex/_generated/api";
import { Loader2, Trash2, CheckCircle2, Circle, CircleDot } from "lucide-react";

import { UploadDropzone } from "@/components/upload-dropzone";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { extractDocumentPages } from "@/lib/extract-text";
import { AuthStateNotice } from "@/components/auth-state-notice";
import { useOrgAuth } from "@/hooks/useOrgAuth";
import { ProjectSectionLayout } from "@/components/project-section-layout";
import { cn } from "@/lib/utils";

const MAX_UPLOAD_MB = Number.parseInt(import.meta.env.VITE_MAX_UPLOAD_MB ?? "400", 10);

export const Route = createFileRoute("/projekte/$id/dokumente")({
	component: ProjectDocumentsPage,
});

interface UploadStateItem {
	name: string;
	status: "uploading" | "processing" | "done" | "error";
	message?: string;
}

function ProjectDocumentsPage() {
    const { id: projectId } = Route.useParams();
    const navigate = useNavigate();
	const auth = useOrgAuth();
	const project = useQuery(
		api.projects.get,
		auth.authReady ? { projectId: projectId as any } : "skip",
	);
	const documents = useQuery(
		api.documents.listByProject,
		auth.authReady ? { projectId: projectId as any } : "skip",
	);
	const standardRun = useQuery(
		api.analysis.getLatest,
		auth.authReady
			? {
				projectId: projectId as any,
				type: "standard",
			}
			: "skip",
	);
const criteriaRun = useQuery(
	api.analysis.getLatest,
	auth.authReady
		? {
			projectId: projectId as any,
			type: "criteria",
		}
		: "skip",
);
	const extractionStatus = useQuery(
		api.analysis.getPflichtenheftExtractionStatus,
		auth.authReady ? { projectId: projectId as any } : "skip",
	);

	const createUploadUrl = useMutation(api.documents.createUploadUrl);
	const attachDocument = useMutation(api.documents.attach);
	const bulkInsertPages = useMutation(api.docPages.bulkInsert);
	const markDocumentExtracted = useMutation(api.documents.markExtracted);
	const removeDocument = useMutation(api.documents.remove);
	const startAnalysis = useMutation(api.projects.startAnalysis);
	const removeProject = useMutation(api.projects.remove);
	const runStandardForProject = useAction(api.analysis.runStandardForProject);
const runCriteriaForProject = useAction(api.analysis.runCriteriaForProject);
const extractPflichtenheft = useAction(api.analysis.extractPflichtenheftCriteria);

const [uploads, setUploads] = useState<UploadStateItem[]>([]);
const [isStartingStandard, setStartingStandard] = useState(false);
const [isStartingCriteria, setStartingCriteria] = useState(false);
const [isDeleting, setDeleting] = useState(false);
const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
const [isExtractingPflichtenheft, setExtractingPflichtenheft] = useState(false);
	const extractionRunStatus = extractionStatus?.run?.status ?? null;
	const extractionRunError = extractionStatus?.run?.error ?? null;
	const isExtractionRunActive = extractionRunStatus === "wartet" || extractionRunStatus === "läuft";

	useEffect(() => {
		if (auth.orgStatus === "ready" && project?.project.projectType === "offerten") {
			navigate({
				to: "/projekte/$id/offerten/setup",
				params: { id: projectId },
				replace: true,
			});
		}
	}, [auth.orgStatus, navigate, project?.project.projectType, projectId]);

	if (auth.orgStatus !== "ready") {
		return <AuthStateNotice status={auth.orgStatus} />;
	}

const isOffertenProject = project?.project.projectType === "offerten";

	if (isOffertenProject) {
		return null;
	}
const pflichtenheftDoc = useMemo(
	() => (documents ?? []).find((doc) => doc.role === "pflichtenheft"),
	[documents],
);
const hasTemplate = Boolean(project?.project.templateId);
const pflichtenheftExtracted = Boolean(pflichtenheftDoc?.textExtracted);

	const hasExtractedPages = useMemo(
		() => (documents ?? []).some((doc) => doc.textExtracted && (doc.pageCount ?? 0) > 0),
		[documents],
	);
	const currentTotalBytes = useMemo(
		() => (documents ?? []).reduce((sum, doc) => sum + doc.size, 0),
		[documents],
	);
	const standardHint = !hasExtractedPages
		? "Mindestens eine extrahierte Seite erforderlich."
		: undefined;
const criteriaHint = !hasTemplate
	? "Template im Projekt erforderlich."
	: !hasExtractedPages
		? "Mindestens eine extrahierte Seite erforderlich."
		: undefined;

	useEffect(() => {
		if (!isExtractionRunActive) {
			setExtractingPflichtenheft(false);
		}
	}, [isExtractionRunActive]);

	const handleFilesAccepted = async (files: File[]) => {
		const shouldAssignPflichtenheft = isOffertenProject && !pflichtenheftDoc;
		let assignedPflichtenheft = false;
		for (const file of files) {
			setUploads((previous) => [
				...previous,
				{ name: file.name, status: "uploading" },
			]);

			try {
				const uploadUrl = await createUploadUrl();
				const response = await fetch(uploadUrl, {
					method: "POST",
					headers: {
						"Content-Type": file.type || "application/octet-stream",
					},
					body: file,
				});

				const json = (await response.json()) as { storageId: string };
				if (!response.ok || !json.storageId) {
					throw new Error("Upload fehlgeschlagen.");
				}

				setUploads((prev) =>
					prev.map((item) =>
						item.name === file.name ? { ...item, status: "processing" } : item,
					),
				);

				const role = shouldAssignPflichtenheft && !assignedPflichtenheft ? "pflichtenheft" : undefined;
				const attached = await attachDocument({
					projectId: projectId as any,
					filename: file.name,
					mimeType: file.type || "application/octet-stream",
					size: file.size,
					storageId: json.storageId as any,
					role: role as any,
				});

				const pages = await extractDocumentPages(file);

				if (pages.length > 0) {
					await bulkInsertPages({
						documentId: attached?._id as any,
						pages: pages.map((page) => ({ page: page.page, text: page.text })),
					});
					await markDocumentExtracted({
						documentId: attached?._id as any,
						pageCount: pages.length,
					});
				} else {
					await markDocumentExtracted({ documentId: attached?._id as any, pageCount: 0 });
				}

				setUploads((prev) =>
					prev.map((item) =>
						item.name === file.name ? { ...item, status: "done" } : item,
					),
				);
				if (role === "pflichtenheft") {
					assignedPflichtenheft = true;
					toast.success(`${file.name} als Pflichtenheft verarbeitet.`);
				} else {
					toast.success(`${file.name} verarbeitet.`);
				}
			} catch (error) {
				console.error(error);
				setUploads((prev) =>
					prev.map((item) =>
						item.name === file.name
							? {
								...item,
								status: "error",
								message:
									error instanceof Error
										? error.message
										: "Upload oder Verarbeitung fehlgeschlagen.",
							}
						: item,
					),
				);
				toast.error(
					error instanceof Error
						? error.message
						: "Upload oder Verarbeitung konnte nicht abgeschlossen werden.",
				);
			}
		}
    };

    const handleDeleteProject = async () => {
        const ok = window.confirm(
            "Dieses Projekt endgültig löschen? Alle Dokumente, Seiten und Analyse-Läufe werden entfernt.",
        );
        if (!ok) return;
        setDeleting(true);
        try {
            await removeProject({ projectId: projectId as any });
            toast.success("Projekt gelöscht.");
            navigate({ to: "/projekte" });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Projekt konnte nicht gelöscht werden.");
        } finally {
            setDeleting(false);
        }
    };

    const handleStartAnalysis = async (type: "standard" | "criteria") => {
        try {
            type === "standard" ? setStartingStandard(true) : setStartingCriteria(true);
            const res = (await startAnalysis({ projectId: projectId as any, type })) as
                | { status: "läuft" | "wartet"; runId: string }
                | undefined;
            // Trigger the actual analysis run via Convex action only if started immediately
            if (res?.status === "läuft") {
                if (type === "standard") {
                    await runStandardForProject({ projectId: projectId as any });
                } else {
                    await runCriteriaForProject({ projectId: projectId as any });
                }
            }
            toast.success(
                type === "standard"
                    ? "Standard-Analyse gestartet."
                    : "Kriterien-Analyse gestartet.",
            );
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Analyse konnte nicht gestartet werden.",
			);
		} finally {
			type === "standard" ? setStartingStandard(false) : setStartingCriteria(false);
		}
	};

	const handleDeleteDocument = async (documentId: string) => {
		const doc = (documents ?? []).find((entry) => entry._id === documentId);
		const friendlyName = doc?.filename ?? "Dokument";
		const confirmDelete = window.confirm(
			`${friendlyName} löschen? Die Datei wird vollständig entfernt. Eine erneute Analyse wird empfohlen.`,
		);
		if (!confirmDelete) {
			return;
		}

		setDeletingDocumentId(documentId);
		try {
			await removeDocument({ documentId: documentId as any });
			toast.success("Dokument gelöscht.");

			const rerun = window.confirm(
				"Analysen jetzt mit den verbleibenden Dokumenten neu starten?",
			);
			if (rerun) {
				await handleStartAnalysis("standard");
				if (hasTemplate) {
					await handleStartAnalysis("criteria");
				}
			}
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Dokument konnte nicht gelöscht werden.",
			);
		} finally {
			setDeletingDocumentId(null);
		}
	};

const handleExtractPflichtenheft = async () => {
		if (isExtractionRunActive) {
			toast.info("Die Extraktion läuft bereits.");
			return;
		}
		if (!pflichtenheftDoc) {
			toast.error("Bitte zuerst ein Pflichtenheft hochladen.");
			return;
		}
		if (!pflichtenheftDoc.textExtracted) {
			toast.error("Das Pflichtenheft wird noch verarbeitet. Bitte später erneut versuchen.");
			return;
		}
		setExtractingPflichtenheft(true);
		try {
			const result = await extractPflichtenheft({ projectId: projectId as any });
			if (result?.criteriaCount) {
				toast.success(`Kriterien extrahiert (${result.criteriaCount}).`);
			} else {
				toast.success("Kriterien extrahiert.");
			}
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Kriterien konnten nicht extrahiert werden.",
			);
		} finally {
			setExtractingPflichtenheft(false);
		}
	};

	const standardStatus = standardRun?.run?.status ?? "wartet";
	const criteriaStatus = criteriaRun?.run?.status ?? "wartet";
	const headerStatuses = (
		<div className="flex flex-wrap items-center gap-3 text-xs font-medium text-muted-foreground">
			<span className="flex items-center gap-2">
				<span>Standard</span>
				<StatusBadge status={standardStatus} />
			</span>
			<span className="flex items-center gap-2">
				<span>Kriterien</span>
				<StatusBadge status={criteriaStatus} />
			</span>
		</div>
	);

	return (
		<ProjectSectionLayout
			projectId={projectId}
			projectName={project?.project.name}
			customer={project?.project.customer ?? null}
			section={{
				id: "dokumente",
				title: "Dokumente",
				description:
					"Laden Sie Ihre Ausschreibungs- oder Angebotsunterlagen hoch. Die Texte werden automatisch verarbeitet.",
			}}
			statusBadge={headerStatuses}
			actions={
				<Button
					variant="ghost"
					size="icon"
					onClick={handleDeleteProject}
					disabled={isDeleting}
					title="Projekt löschen"
					aria-label="Projekt löschen"
				>
					{isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
				</Button>
			}
		>
			<div className="space-y-6">
				{isOffertenProject ? (
					<OffertenDocumentsGuide
						pflichtenheftName={pflichtenheftDoc?.filename ?? null}
							pflichtenheftExtracted={pflichtenheftExtracted}
							hasTemplate={hasTemplate}
							onExtract={handleExtractPflichtenheft}
							extracting={isExtractingPflichtenheft || isExtractionRunActive}
							runStatus={extractionRunStatus}
							runError={extractionRunError}
							onGoToOfferten={() =>
							navigate({
								to: "/projekte/$id/offerten",
								params: { id: projectId },
							})
						}
					/>
				) : null}

				<Card>
				<CardHeader>
					<CardTitle>Dokumente</CardTitle>
				</CardHeader>
				<CardContent>
					<UploadDropzone
						maxTotalSizeMb={MAX_UPLOAD_MB}
						onFilesAccepted={handleFilesAccepted}
						currentTotalBytes={currentTotalBytes}
					/>
					{uploads.length > 0 ? (
						<ul className="mt-4 space-y-2 text-sm">
							{uploads.map((upload) => (
								<li
									key={upload.name}
									className="flex items-center justify-between rounded-md border px-3 py-2"
								>
									<span>{upload.name}</span>
									<span className="text-xs text-muted-foreground">
										{formatUploadStatus(upload)}
									</span>
								</li>
							))}
						</ul>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Hochgeladene Dateien</CardTitle>
					<CardDescription>
						Live-Status der Uploads und Extraktion. Die Liste aktualisiert sich automatisch.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{documents === undefined ? (
						<p className="text-sm text-muted-foreground">Lade Daten …</p>
					) : documents.length === 0 ? (
						<p className="text-sm text-muted-foreground">Noch keine Dateien hochgeladen.</p>
					) : (
						<ul className="space-y-3 text-sm">
							{documents.map((doc) => (
								<li
									key={doc._id}
									className="rounded-lg border border-border/60 p-3"
								>
									<div className="flex flex-wrap items-center justify-between gap-3">
										<div className="space-y-1">
											<div className="flex items-center gap-2">
												<p className="font-medium">{doc.filename}</p>
												{doc.role === "pflichtenheft" ? (
													<span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
														Pflichtenheft
													</span>
												) : null}
											</div>
											<p className="text-xs text-muted-foreground">
												{formatFileSize(doc.size)} · {doc.pageCount ?? 0} Seiten · hochgeladen am {formatDate(doc.createdAt)}
											</p>
										</div>
										<div className="flex items-center gap-2">
											<span className="text-xs text-muted-foreground">
												{doc.textExtracted ? "Extrahiert" : "Ausstehend"}
											</span>
											<Button
												variant="ghost"
												size="icon"
												onClick={() => handleDeleteDocument(doc._id as any)}
												disabled={deletingDocumentId === doc._id}
												title="Dokument löschen"
												aria-label="Dokument löschen"
											>
												{deletingDocumentId === doc._id ? (
													<Loader2 className="h-4 w-4 animate-spin" />
												) : (
													<Trash2 className="h-4 w-4" />
												)}
											</Button>
										</div>
									</div>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Analysen</CardTitle>
					<CardDescription>
						Starte neue Analysen, sobald Dokumentseiten extrahiert wurden. Buttons aktivieren sich automatisch.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 md:grid-cols-2">
					<AnalysisRunCard
						title="Standard-Analyse"
						run={standardRun?.run ?? null}
						onStart={() => handleStartAnalysis("standard")}
						disabled={!hasExtractedPages}
						loading={isStartingStandard}
						hint={standardHint}
					/>
					<AnalysisRunCard
						title="Kriterien-Analyse"
						run={criteriaRun?.run ?? null}
						onStart={() => handleStartAnalysis("criteria")}
						disabled={!hasExtractedPages || !hasTemplate}
						loading={isStartingCriteria}
						hint={criteriaHint}
					/>
				</CardContent>
			</Card>

			</div>
		</ProjectSectionLayout>
	);
}

interface OffertenDocumentsGuideProps {
	pflichtenheftName: string | null;
	pflichtenheftExtracted: boolean;
	hasTemplate: boolean;
	onExtract: () => void;
	extracting: boolean;
	onGoToOfferten: () => void;
	runStatus: "wartet" | "läuft" | "fertig" | "fehler" | null;
	runError?: string | null;
}

function OffertenDocumentsGuide({
	pflichtenheftName,
	pflichtenheftExtracted,
	hasTemplate,
	onExtract,
	extracting,
	onGoToOfferten,
	runStatus,
	runError,
}: OffertenDocumentsGuideProps) {
	const stepOneStatus = pflichtenheftName ? "done" : "current";
	const stepTwoStatus = hasTemplate ? "done" : pflichtenheftName ? "current" : "pending";
	const stepThreeStatus = hasTemplate ? "done" : "pending";
	const isRunActive = runStatus === "wartet" || runStatus === "läuft";

	return (
		<Card className="border-primary/40 bg-primary/5">
			<CardHeader>
				<CardTitle>Offerten-Setup</CardTitle>
				<CardDescription>
					Folge den drei Schritten, um den Angebotsvergleich zu aktivieren.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<OffertenSetupStep
					status={stepOneStatus}
					title="Pflichtenheft hochladen"
					description={
						pflichtenheftName
							? `Bereit: ${pflichtenheftName}`
							: "Lade das Pflichtenheft unterhalb über die Dokumenten-Upload-Zone hoch."
					}
				/>
				<OffertenSetupStep
					status={stepTwoStatus}
					title="Kriterien extrahieren"
					description={
						hasTemplate
							? "Erfolgreich: Template erstellt."
							: pflichtenheftName
								? pflichtenheftExtracted
									? "Starte die automatische Extraktion, sobald das Pflichtenheft verarbeitet ist."
									: "Pflichtenheft wird noch verarbeitet."
								: "Der Extraktionsschritt wird aktiv, sobald ein Pflichtenheft vorhanden ist."
					}
						action={
							!hasTemplate ? (
								<Button
									size="sm"
									onClick={onExtract}
									disabled={!pflichtenheftExtracted || extracting || isRunActive}
								>
									{extracting || isRunActive ? "Extrahiere …" : "Kriterien extrahieren"}
								</Button>
							) : null
						}
					/>
					{isRunActive ? (
						<p className="text-xs text-muted-foreground">
							Die Extraktion läuft im Hintergrund. Du kannst später zum Vergleich zurückkehren.
						</p>
					) : null}
					{!isRunActive && runError ? (
						<p className="text-xs text-destructive">Fehler bei der Extraktion: {runError}</p>
					) : null}
				<OffertenSetupStep
					status={stepThreeStatus}
					title="Angebote vergleichen"
					description="Sobald das Template bereit ist, kannst du Angebote erfassen und vergleichen."
					action={
						<Button
							size="sm"
							variant="outline"
							onClick={onGoToOfferten}
							disabled={!hasTemplate}
						>
							Zum Vergleich
						</Button>
					}
				/>
			</CardContent>
		</Card>
	);
}

interface OffertenSetupStepProps {
	status: "done" | "current" | "pending";
	title: string;
	description: string;
	action?: ReactNode;
}

function OffertenSetupStep({ status, title, description, action }: OffertenSetupStepProps) {
	const icon = {
		done: <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />,
		current: <CircleDot className="h-4 w-4 text-primary" aria-hidden />,
		pending: <Circle className="h-4 w-4 text-muted-foreground" aria-hidden />,
	}[status];

	return (
		<div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background px-3 py-3 md:flex-row md:items-center md:justify-between">
			<div className="flex items-start gap-3">
				<span className="mt-1">{icon}</span>
				<div className="space-y-1">
					<p className={cn("text-sm font-medium", status === "pending" && "text-muted-foreground")}>{title}</p>
					<p className="text-xs text-muted-foreground">{description}</p>
				</div>
			</div>
			{action ? <div className="pt-1 md:pt-0">{action}</div> : null}
		</div>
	);
}

interface AnalysisRunCardProps {
	title: string;
	run: {
		_id: string;
		status: "wartet" | "läuft" | "fertig" | "fehler";
		error?: string | null;
		queuedAt: number;
		startedAt?: number;
		finishedAt?: number;
		provider: string;
		model: string;
		promptTokens?: number | null;
		completionTokens?: number | null;
		latencyMs?: number | null;
	} | null;
	onStart: () => void;
	disabled: boolean;
	loading: boolean;
	hint?: string;
}

function AnalysisRunCard({ title, run, onStart, disabled, loading, hint }: AnalysisRunCardProps) {
	return (
		<Card>
			<CardHeader className="flex flex-wrap items-center justify-between gap-3">
				<div className="space-y-1">
					<CardTitle>{title}</CardTitle>
					{run ? <StatusBadge status={run.status} /> : <span className="text-xs text-muted-foreground">Noch keine Analyse</span>}
				</div>
				<Button size="sm" onClick={onStart} disabled={disabled || loading}>
					{loading ? "Startet …" : "Analyse starten"}
				</Button>
			</CardHeader>
			<CardContent className="space-y-1 text-sm text-muted-foreground">
				{run ? (
					<>
						{run.error ? <p className="text-rose-500">Fehler: {run.error}</p> : null}
						<p>Provider: {run.provider}</p>
						{typeof run.promptTokens === "number" ? (
							<p>Tokens: {run.promptTokens ?? 0}↦{run.completionTokens ?? 0}</p>
						) : null}
					</>
				) : (
					<p>Starte eine Analyse, sobald Seiten extrahiert sind.</p>
				)}
				{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
			</CardContent>
		</Card>
	);
}

function formatUploadStatus(upload: UploadStateItem) {
	switch (upload.status) {
		case "uploading":
			return "Upload läuft …";
		case "processing":
			return "Textextraktion";
		case "done":
			return "Fertig";
		case "error":
			return upload.message ?? "Fehler";
	}
}

function formatFileSize(bytes: number) {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	const kb = bytes / 1024;
	if (kb < 1024) {
		return `${kb.toFixed(1)} KB`;
	}
	const mb = kb / 1024;
	return `${mb.toFixed(1)} MB`;
}

function formatDate(timestamp: number) {
	return new Date(timestamp).toLocaleDateString("de-CH", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	});
}
