import { useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Link, createFileRoute } from "@tanstack/react-router";

const sampleProjects = [
	{
		id: "projekt-1",
		name: "Schulhaus Winterthur",
		customer: "Stadt Winterthur",
		tags: ["Bau", "Bildung"],
		updatedAt: "2024-02-10",
		status: "fertig" as const,
	},
	{
		id: "projekt-2",
		name: "IT-Betrieb Bund",
		customer: "Bundesamt für Informatik",
		tags: ["IT", "Service"],
		updatedAt: "2024-01-22",
		status: "läuft" as const,
	},
	{
		id: "projekt-3",
		name: "Verkehrsleitsystem",
		customer: "Kanton Zürich",
		tags: ["Mobilität"],
		updatedAt: "2024-01-05",
		status: "wartet" as const,
	},
];

export const Route = createFileRoute("/projekte")({
	component: ProjektePage,
});

function ProjektePage() {
	const [showCreate, setShowCreate] = useState(false);

	return (
		<div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-6 px-4 py-10">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-3xl font-semibold">Projekte</h1>
					<p className="text-muted-foreground">
						Verwalte deine Ausschreibungen, lade Unterlagen hoch und starte Analysen.
					</p>
				</div>
				<Button onClick={() => setShowCreate((prev) => !prev)}>
					Neues Projekt
				</Button>
			</header>

			{showCreate ? <NewProjectStub onClose={() => setShowCreate(false)} /> : null}

			<section className="grid gap-4">
				{sampleProjects.map((project) => (
					<Card key={project.id}>
						<CardHeader className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<CardTitle>{project.name}</CardTitle>
								<CardDescription>
									{project.customer} · {project.tags.join(", ")} · Aktualisiert am {project.updatedAt}
								</CardDescription>
							</div>
							<StatusBadge status={project.status} />
						</CardHeader>
						<CardContent className="flex flex-wrap gap-3 text-sm">
							<Link
								to="/projekte/$id/standard"
								params={{ id: project.id }}
								className="rounded-md border px-3 py-2 transition-colors hover:bg-muted"
							>
								Standard-Ansicht
							</Link>
							<Link
								to="/projekte/$id/kriterien"
								params={{ id: project.id }}
								className="rounded-md border px-3 py-2 transition-colors hover:bg-muted"
							>
								Kriterien-Ansicht
							</Link>
							<Link
								to="/projekte/$id/dokumente"
								params={{ id: project.id }}
								className="rounded-md border px-3 py-2 transition-colors hover:bg-muted"
							>
								Dokumente
							</Link>
							<Link
								to="/projekte/$id/export"
								params={{ id: project.id }}
								className="rounded-md border px-3 py-2 transition-colors hover:bg-muted"
							>
								Export
							</Link>
						</CardContent>
					</Card>
				))}
			</section>
		</div>
	);
}

function NewProjectStub({ onClose }: { onClose: () => void }) {
	return (
		<Card className="border-dashed">
			<CardHeader className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<CardTitle>Neues Projekt erstellen</CardTitle>
					<CardDescription>
						Dieses Formular ist ein Platzhalter – die eigentliche Anbindung folgt in Phase 6.
					</CardDescription>
				</div>
				<Button variant="ghost" onClick={onClose}>
					Abbrechen
				</Button>
			</CardHeader>
			<CardContent className="grid gap-4 md:grid-cols-2">
				<Input placeholder="Projektname" disabled />
				<Input placeholder="Kunde/Behörde" disabled />
				<Input placeholder="Tags (Komma-getrennt)" disabled />
				<Input placeholder="Optionales Template" disabled />
			</CardContent>
		</Card>
	);
}
