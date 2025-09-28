import { useMemo, useState } from "react";

import { Link, createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@tendera/backend/convex/_generated/api";
import { UploadDropzone } from "@/components/upload-dropzone";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { extractDocumentPages } from "@/lib/extract-text";
import { AuthStateNotice } from "@/components/auth-state-notice";
import { useOrgAuth } from "@/hooks/useOrgAuth";

const MAX_UPLOAD_MB = Number(
	import.meta.env.VITE_MAX_UPLOAD_MB ?? import.meta.env.MAX_UPLOAD_MB ?? 200,
);

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

    const createUploadUrl = useMutation(api.documents.createUploadUrl);
	const attachDocument = useMutation(api.documents.attach);
	const bulkInsertPages = useMutation(api.docPages.bulkInsert);
	const markDocumentExtracted = useMutation(api.documents.markExtracted);
    const startAnalysis = useMutation(api.projects.startAnalysis);
    const runStandardForProject = useAction(api.analysis.runStandardForProject);
    const runCriteriaForProject = useAction(api.analysis.runCriteriaForProject);

	const [uploads, setUploads] = useState<UploadStateItem[]>([]);
	const [isStartingStandard, setStartingStandard] = useState(false);
	const [isStartingCriteria, setStartingCriteria] = useState(false);

	if (auth.orgStatus !== "ready") {
		return <AuthStateNotice status={auth.orgStatus} />;
	}

	const hasExtractedPages = useMemo(
		() => (documents ?? []).some((doc) => doc.textExtracted && (doc.pageCount ?? 0) > 0),
		[documents],
	);
	const currentTotalBytes = useMemo(
		() => (documents ?? []).reduce((sum, doc) => sum + doc.size, 0),
		[documents],
	);
	const hasTemplate = Boolean(project?.project.templateId);

	const standardHint = !hasExtractedPages
		? "Mindestens eine extrahierte Seite erforderlich."
		: undefined;
	const criteriaHint = !hasTemplate
		? "Template im Projekt erforderlich."
		: !hasExtractedPages
			? "Mindestens eine extrahierte Seite erforderlich."
			: undefined;

	const handleFilesAccepted = async (files: File[]) => {
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

				const attached = await attachDocument({
					projectId: projectId as any,
					filename: file.name,
					mimeType: file.type || "application/octet-stream",
					size: file.size,
					storageId: json.storageId as any,
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
				toast.success(`${file.name} verarbeitet.`);
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

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
			<Card>
				<CardHeader className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle>Dokumente · {project?.project.name ?? "Projekt"}</CardTitle>
						<CardDescription>
							Upload und Verarbeitung der Angebotsunterlagen. Nach dem Upload werden die Texte lokal
							extrahiert und an Convex übertragen.
						</CardDescription>
					</div>
					<div className="flex gap-2">
						<Link
							to="/projekte/$id/standard"
							params={{ id: projectId }}
							className="rounded-md border px-3 py-1 text-sm"
						>
							Standard
						</Link>
						<Link
							to="/projekte/$id/kriterien"
							params={{ id: projectId }}
							className="rounded-md border px-3 py-1 text-sm"
						>
							Kriterien
						</Link>
						<Link
							to="/projekte/$id/kommentare"
							params={{ id: projectId }}
							className="rounded-md border px-3 py-1 text-sm"
						>
							Kommentare
						</Link>
						<Link
							to="/projekte/$id/export"
							params={{ id: projectId }}
							className="rounded-md border px-3 py-1 text-sm"
						>
							Export
						</Link>
					</div>
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
										<div>
											<p className="font-medium">{doc.filename}</p>
											<p className="text-xs text-muted-foreground">
												{formatFileSize(doc.size)} · {doc.pageCount ?? 0} Seiten · hochgeladen am {formatDate(doc.createdAt)}
											</p>
										</div>
										<span className="text-xs text-muted-foreground">
											{doc.textExtracted ? "Extrahiert" : "Ausstehend"}
										</span>
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
