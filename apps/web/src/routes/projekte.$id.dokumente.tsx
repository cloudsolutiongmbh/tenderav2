import { UploadDropzone } from "@/components/upload-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, createFileRoute } from "@tanstack/react-router";

const placeholderDocuments = [
	{ id: "doc-1", filename: "Ausschreibung.pdf", size: "12.4 MB", uploadedAt: "2024-01-12" },
	{ id: "doc-2", filename: "Leistungsverzeichnis.docx", size: "4.8 MB", uploadedAt: "2024-01-12" },
];

export const Route = createFileRoute("/projekte/$id/dokumente")({
	component: ProjectDocumentsPage,
});

function ProjectDocumentsPage() {
	const { id } = Route.useParams();

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
			<Card>
				<CardHeader className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle>Dokumente</CardTitle>
						<CardDescription>
							Upload und Verwaltung der Angebotsunterlagen (Platzhalter – Upload folgt in Phase 6).
						</CardDescription>
					</div>
					<div className="flex gap-2">
						<Link
							to="/projekte/$id/standard"
							params={{ id }}
							className="rounded-md border px-3 py-1 text-sm"
						>
							Standard
						</Link>
						<Link
							to="/projekte/$id/kriterien"
							params={{ id }}
							className="rounded-md border px-3 py-1 text-sm"
						>
							Kriterien
						</Link>
						<Link
							to="/projekte/$id/export"
							params={{ id }}
							className="rounded-md border px-3 py-1 text-sm"
						>
							Export
						</Link>
					</div>
				</CardHeader>
				<CardContent>
					<UploadDropzone disabled onFilesAccepted={() => {}} />
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Hochgeladene Dateien</CardTitle>
					<CardDescription>
						Beispieldaten – tatsächliche Dokumente werden nach Umsetzung der Upload-Logik angezeigt.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{placeholderDocuments.length > 0 ? (
						<ul className="space-y-3 text-sm">
							{placeholderDocuments.map((doc) => (
								<li
									key={doc.id}
									className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 p-3"
								>
									<div>
										<p className="font-medium">{doc.filename}</p>
										<p className="text-xs text-muted-foreground">
											{doc.size} · hochgeladen am {doc.uploadedAt}
										</p>
									</div>
									<Button variant="ghost" size="sm" disabled>
										Ansehen
									</Button>
								</li>
							))}
						</ul>
					) : (
						<p className="text-sm text-muted-foreground">Noch keine Dateien hochgeladen.</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
