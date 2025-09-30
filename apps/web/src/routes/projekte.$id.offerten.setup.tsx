import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { api } from "@tendera/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { AuthStateNotice } from "@/components/auth-state-notice";
import { ProjectSectionLayout } from "@/components/project-section-layout";
import { useOrgAuth } from "@/hooks/useOrgAuth";
import { UploadDropzone } from "@/components/upload-dropzone";
import { extractDocumentPages } from "@/lib/extract-text";

export const Route = createFileRoute("/projekte/$id/offerten/setup")({
	component: OffertenSetupPage,
});

const MAX_UPLOAD_MB = Number.parseInt(import.meta.env.VITE_MAX_UPLOAD_MB ?? "200", 10);
const OFFER_DOCUMENT_LIMIT = 8;

interface PflichtenheftUploadState {
	status: "uploading" | "processing" | "done" | "error";
	filename: string;
	message?: string;
}

interface OfferUploadState {
	id: string;
	status: "uploading" | "processing" | "done" | "error";
	filename: string;
	message?: string;
}

function OffertenSetupPage() {
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

const offers = useQuery(
	api.offers.list,
	auth.authReady ? { projectId: projectId as any } : "skip",
);

	const extractionStatus = useQuery(
		api.analysis.getPflichtenheftExtractionStatus,
		auth.authReady ? { projectId: projectId as any } : "skip",
	);

	const createUploadUrl = useMutation(api.documents.createUploadUrl);
	const attachDocument = useMutation(api.documents.attach);
	const bulkInsertPages = useMutation(api.docPages.bulkInsert);
	const markDocumentExtracted = useMutation(api.documents.markExtracted);
const ensureOfferFromDocument = useMutation(api.offers.ensureFromDocument);

const [isExtracting, setExtracting] = useState(false);
const [uploadState, setUploadState] = useState<PflichtenheftUploadState | null>(null);
const [offerUploads, setOfferUploads] = useState<OfferUploadState[]>([]);
const extractCriteria = useAction(api.analysis.extractPflichtenheftCriteria);

const extractionRunStatus = extractionStatus?.run?.status ?? null;
const extractionRunError = extractionStatus?.run?.error ?? null;
const isExtractionRunning = extractionRunStatus === "wartet" || extractionRunStatus === "läuft";

	if (auth.orgStatus !== "ready") {
		return <AuthStateNotice status={auth.orgStatus} />;
	}

	const pflichtenheft = useMemo(() => {
		const docs = documents ?? [];
		const byRole = docs.find((doc) => doc.role === "pflichtenheft");
		if (byRole) {
			return byRole;
		}
		if (docs.length === 1) {
			return docs[0];
		}
		return undefined;
	}, [documents]);
	const offerDocuments = useMemo(
		() => (documents ?? []).filter((doc) => doc.role === "offer"),
		[documents],
	);
	const offersByDocumentId = useMemo(() => {
		const map = new Map<string, any>();
		for (const offer of offers ?? []) {
			if (offer.documentId) {
				map.set(offer.documentId, offer);
			}
		}
		return map;
	}, [offers]);
	const hasTemplate = Boolean(project?.project.templateId);
const pflichtenheftExtracted = Boolean(pflichtenheft?.textExtracted);
const currentTotalBytes = useMemo(
	() => (documents ?? []).reduce((sum, doc) => sum + doc.size, 0),
	[documents],
);
const isUploading = uploadState?.status === "uploading" || uploadState?.status === "processing";
	const offerSlotsRemaining = Math.max(0, OFFER_DOCUMENT_LIMIT - offerDocuments.length);
	const isOfferUploading = useMemo(
		() => offerUploads.some((item) => item.status === "uploading" || item.status === "processing"),
		[offerUploads],
	);
	const pendingOfferEnsuresRef = useRef(new Set<string>());

	useEffect(() => {
		if (!isExtractionRunning) {
			setExtracting(false);
		}
	}, [isExtractionRunning]);

	const ensureOfferForDocument = useCallback(
		async (document: any, options?: { showToast?: boolean }) => {
			if (!document?._id) {
				return;
			}
			if (offersByDocumentId.has(document._id)) {
				return;
			}
			if (pendingOfferEnsuresRef.current.has(document._id)) {
				return;
			}

			pendingOfferEnsuresRef.current.add(document._id);
			try {
				const result = await ensureOfferFromDocument({
					projectId: projectId as any,
					documentId: document._id,
					anbieterName: deriveOfferName(document.filename),
				});
				if (options?.showToast && result?.created) {
					toast.success(`Angebot aus ${document.filename} erstellt.`);
				}
			} catch (error) {
				if (options?.showToast) {
					toast.error(
						error instanceof Error
							? error.message
							: "Angebot konnte nicht erstellt werden.",
					);
				} else {
					console.error(error);
				}
			} finally {
				pendingOfferEnsuresRef.current.delete(document._id);
			}
		},
		[ensureOfferFromDocument, offersByDocumentId, projectId],
	);

	useEffect(() => {
		for (const doc of offerDocuments) {
			void ensureOfferForDocument(doc);
		}
	}, [offerDocuments, ensureOfferForDocument]);

	const handlePflichtenheftUpload = async (files: File[]) => {
		if (pflichtenheft) {
			toast.error("Es ist bereits ein Pflichtenheft hinterlegt. Bitte entferne es zuerst im Dokumente-Bereich, um ein neues hochzuladen.");
			return;
		}
		const file = files[0];
		if (!file) {
			return;
		}

		setUploadState({ status: "uploading", filename: file.name });
		try {
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

			setUploadState({ status: "processing", filename: file.name });

			const attached = await attachDocument({
				projectId: projectId as any,
				filename: file.name,
				mimeType: file.type || "application/octet-stream",
				size: file.size,
				storageId: json.storageId as any,
				role: "pflichtenheft" as any,
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

			setUploadState({ status: "done", filename: file.name });
			toast.success("Pflichtenheft gespeichert. Als nächstes Kriterien extrahieren.");
		} catch (error) {
			console.error(error);
			setUploadState({
				status: "error",
				filename: file.name,
				message:
					error instanceof Error
						? error.message
						: "Upload oder Verarbeitung fehlgeschlagen.",
			});
			toast.error(
				error instanceof Error
					? error.message
					: "Upload oder Verarbeitung konnte nicht abgeschlossen werden.",
			);
		}
	};

	const handleOfferUpload = async (files: File[]) => {
		if (offerSlotsRemaining <= 0) {
			toast.error("Es können maximal 8 Angebotsdokumente hinzugefügt werden.");
			return;
		}

		const allowedCount = Math.min(offerSlotsRemaining, files.length);
		const acceptedFiles = Array.from(files).slice(0, allowedCount);
		if (acceptedFiles.length < files.length) {
			toast.info(
				`Nur ${allowedCount} weitere${allowedCount === 1 ? "s" : ""} Dokument${allowedCount === 1 ? "" : "e"} möglich. Überschüssige Dateien wurden ignoriert.`,
			);
		}

		for (const file of acceptedFiles) {
			const uploadId = `offer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
			setOfferUploads((previous) => [
				...previous,
				{ id: uploadId, filename: file.name, status: "uploading" },
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

				const json = (await response.json()) as { storageId?: string };
				if (!response.ok || !json.storageId) {
					throw new Error("Upload fehlgeschlagen.");
				}

				setOfferUploads((prev) =>
					prev.map((item) =>
						item.id === uploadId ? { ...item, status: "processing" } : item,
					),
				);

				const attached = await attachDocument({
					projectId: projectId as any,
					filename: file.name,
					mimeType: file.type || "application/octet-stream",
					size: file.size,
					storageId: json.storageId as any,
					role: "offer" as any,
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

				await ensureOfferForDocument(attached, { showToast: true });

				setOfferUploads((prev) =>
					prev.map((item) =>
						item.id === uploadId ? { ...item, status: "done" } : item,
					),
				);
			} catch (error) {
				console.error(error);
				setOfferUploads((prev) =>
					prev.map((item) =>
						item.id === uploadId
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

const handleExtract = async () => {
		if (isExtractionRunning) {
			toast.info("Die Extraktion läuft bereits im Hintergrund.");
			return;
		}
		if (!pflichtenheft) {
			toast.error("Bitte zuerst ein Pflichtenheft hochladen.");
			return;
		}

		setExtracting(true);
		try {
			const result = await extractCriteria({ projectId: projectId as any });
			toast.success(`Kriterien erfolgreich extrahiert! ${result.criteriaCount} Kriterien gefunden.`);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Kriterien konnten nicht extrahiert werden.",
			);
		} finally {
			setExtracting(false);
		}
	};

	const handleContinue = () => {
		navigate({
			to: "/projekte/$id/offerten",
			params: { id: projectId },
		});
	};

	return (
		<ProjectSectionLayout
			projectId={projectId}
			projectName={project?.project.name}
			customer={project?.project.customer ?? null}
			section={{
				id: "offerten-setup",
				title: "Offerten-Vergleich Setup",
				description: "Lade das Pflichtenheft hoch und extrahiere die Kriterien.",
			}}
		>
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>1. Pflichtenheft hochladen</CardTitle>
						<CardDescription>
							Lade das Dokument hoch, das die Muss- und Kann-Kriterien enthält.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{pflichtenheft ? (
							<>
								<div className="rounded-md border border-green-200 bg-green-50 p-4">
									<p className="text-sm font-medium text-green-900">
										✓ Pflichtenheft hochgeladen: {pflichtenheft.filename}
									</p>
									<p className="mt-1 text-xs text-green-700">
										{pflichtenheft.pageCount ?? 0} Seiten · {pflichtenheftExtracted ? "Texte extrahiert" : "Verarbeitung läuft"}
									</p>
								</div>
								<p className="text-xs text-muted-foreground">
									Um das Pflichtenheft zu ersetzen, entferne das bestehende Dokument im Bereich „Dokumente" und lade anschliessend ein neues hoch.
								</p>
							</>
						) : (
							<p className="text-sm text-muted-foreground">
								Lade das Pflichtenheft direkt hier hoch. Die Texte werden automatisch extrahiert.
							</p>
						)}
					<UploadDropzone
						maxTotalSizeMb={MAX_UPLOAD_MB}
						onFilesAccepted={handlePflichtenheftUpload}
						disabled={isUploading || Boolean(pflichtenheft)}
						currentTotalBytes={currentTotalBytes}
						maxFiles={1}
					/>
						{uploadState ? (
							<p
								className={
									uploadState.status === "error"
										? "text-xs text-destructive"
										: "text-xs text-muted-foreground"
								}
							>
								{formatPflichtenheftUploadState(uploadState)}
							</p>
						) : null}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>2. Angebotsdokumente hochladen</CardTitle>
						<CardDescription>
							Bis zu 8 Dokumente hinzufügen. Für jede Datei wird automatisch ein Angebot erstellt.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-sm text-muted-foreground">
							{offerDocuments.length} / {OFFER_DOCUMENT_LIMIT} Dokumente hochgeladen.
						</p>
						<UploadDropzone
							maxTotalSizeMb={MAX_UPLOAD_MB}
							onFilesAccepted={handleOfferUpload}
							disabled={isOfferUploading || offerSlotsRemaining === 0}
							currentTotalBytes={currentTotalBytes}
							maxFiles={Math.max(1, offerSlotsRemaining || 1)}
						/>
						{offerUploads.length > 0 ? (
							<ul className="space-y-2 text-xs text-muted-foreground">
								{offerUploads.map((upload) => (
									<li key={upload.id} className="flex items-center justify-between rounded-md border px-3 py-2">
										<span>{upload.filename}</span>
										<span>{formatOfferUploadState(upload)}</span>
									</li>
								))}
							</ul>
						) : null}
						{offerSlotsRemaining === 0 ? (
							<p className="text-xs text-muted-foreground">
								Limit erreicht. Entferne ein Dokument im Bereich „Dokumente", um Platz zu schaffen.
							</p>
						) : null}
						<div className="space-y-2">
							{offerDocuments.length === 0 ? (
								<p className="text-sm text-muted-foreground">Noch keine Angebotsdokumente vorhanden.</p>
							) : (
								<ul className="space-y-2 text-sm">
									{offerDocuments.map((doc) => {
										const offer = offersByDocumentId.get(doc._id);
										return (
											<li
												key={doc._id}
												className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-3"
											>
												<div className="space-y-1">
													<p className="font-medium">{doc.filename}</p>
													<p className="text-xs text-muted-foreground">
														{doc.pageCount ?? 0} Seiten · {doc.textExtracted ? "Texte extrahiert" : "Verarbeitung läuft"}
													</p>
												</div>
												<div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
													{offer ? (
														<>
															<span className="font-medium text-foreground">{offer.anbieterName}</span>
															{offer.latestStatus ? (
																<StatusBadge status={offer.latestStatus} />
															) : (
																<span>Angebot bereit</span>
															)}
														</>
													) : (
														<span className="text-xs">Angebot wird vorbereitet …</span>
													)}
												</div>
											</li>
										);
									})}
								</ul>
							)}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>3. Kriterien extrahieren</CardTitle>
						<CardDescription>
							Automatische Extraktion aller Muss- und Kann-Kriterien aus dem Pflichtenheft.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{hasTemplate ? (
							<div className="rounded-md border border-green-200 bg-green-50 p-4">
								<p className="text-sm font-medium text-green-900">
									✓ Kriterien wurden extrahiert
								</p>
								<p className="mt-1 text-xs text-green-700">
									Template wurde erstellt und mit dem Projekt verknüpft.
								</p>
							</div>
						) : (
							<>
								{!pflichtenheft ? (
									<p className="text-sm text-muted-foreground">
										Bitte lade zuerst ein Pflichtenheft hoch. Danach kannst du hier die Kriterien extrahieren.
									</p>
								) : !pflichtenheftExtracted ? (
									<p className="flex items-center gap-2 text-sm text-muted-foreground">
										<Loader2 className="h-4 w-4 animate-spin" aria-hidden />
										Verarbeitung läuft. Sobald die Texterkennung abgeschlossen ist, kannst du die Kriterien extrahieren.
									</p>
								) : (
									<p className="text-sm text-muted-foreground">
										Die KI extrahiert Muss- und Kann-Kriterien aus dem Pflichtenheft und erstellt automatisch ein Template.
									</p>
								)}
									<Button
										onClick={handleExtract}
										disabled={!pflichtenheftExtracted || isExtracting || isExtractionRunning}
									>
										{isExtracting || isExtractionRunning ? (
											<>
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												{extractionRunStatus === "wartet"
													? "Extraktion in Warteschlange …"
													: "Extrahiere Kriterien …"}
											</>
										) : (
											"Kriterien extrahieren"
										)}
									</Button>
									{extractionRunError ? (
										<p className="text-xs text-destructive">Fehler bei der letzten Extraktion: {extractionRunError}</p>
									) : null}
									{isExtractionRunning && !extractionRunError ? (
										<p className="text-xs text-muted-foreground">
											Die Extraktion läuft im Hintergrund. Du kannst die Seite verlassen und später zurückkehren.
										</p>
									) : null}
								</>
						)}
					</CardContent>
				</Card>

				{hasTemplate && (
					<Card>
						<CardHeader>
							<CardTitle>4. Weiter zu Offerten</CardTitle>
							<CardDescription>
								Setup abgeschlossen. Füge jetzt Angebote hinzu und vergleiche sie.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Button onClick={handleContinue}>Zu Offerten-Vergleich</Button>
						</CardContent>
					</Card>
				)}
			</div>
		</ProjectSectionLayout>
	);
}

function formatPflichtenheftUploadState(state: PflichtenheftUploadState) {
	switch (state.status) {
		case "uploading":
			return `Lade ${state.filename} hoch …`;
		case "processing":
			return `Verarbeite ${state.filename} …`;
		case "done":
			return `${state.filename} verarbeitet.`;
		case "error":
			return state.message ?? `${state.filename}: Fehler beim Upload.`;
	}
}

function formatOfferUploadState(state: OfferUploadState) {
	switch (state.status) {
		case "uploading":
			return "Upload läuft …";
		case "processing":
			return "Verarbeitung";
		case "done":
			return "Fertig";
		case "error":
			return state.message ?? "Fehler";
	}
}

function deriveOfferName(filename: string) {
	const withoutExtension = filename.replace(/\.[^/.]+$/, "");
	return withoutExtension.trim() || filename;
}
