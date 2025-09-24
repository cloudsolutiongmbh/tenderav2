import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link, createFileRoute } from "@tanstack/react-router";

const placeholderTemplate = {
	id: "template-1",
	name: "Bauprojekt Standard",
	description: "Checkliste für Hochbauprojekte im öffentlichen Bereich.",
	language: "Deutsch",
	version: "1.0",
	visibleOrgWide: true,
	criteria: [
		{
			key: "C1",
			title: "Nachhaltigkeitsnachweis",
			description: "Minergie oder gleichwertig",
			answerType: "boolean",
			weight: 40,
			required: true,
		},
		{
			key: "C2",
			title: "Referenzen",
			description: "Mindestens zwei Schulbauten",
			answerType: "text",
			weight: 30,
			required: true,
		},
	],
};

export const Route = createFileRoute("/templates/$id")({
	component: TemplateDetailPage,
});

function TemplateDetailPage() {
	const { id } = Route.useParams();

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
			<Card>
				<CardHeader className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle>Template {id}</CardTitle>
						<CardDescription>
							Formular als Platzhalter – die Bearbeitung folgt mit der Backend-Anbindung.
						</CardDescription>
					</div>
					<Link to="/templates" className="rounded-md border px-3 py-1 text-sm">
						Zurück zur Übersicht
					</Link>
				</CardHeader>
			</Card>

			<Card className="border-dashed">
				<CardHeader>
					<CardTitle>Basisdaten</CardTitle>
					<CardDescription>Eingabefelder sind deaktiviert.</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 md:grid-cols-2">
					<Input value={placeholderTemplate.name} disabled />
					<Input value={placeholderTemplate.language} disabled />
					<Input value={placeholderTemplate.version} disabled />
					<Input value={placeholderTemplate.visibleOrgWide ? "Org-weit" : "Privat"} disabled />
					<Textarea
						value={placeholderTemplate.description}
						disabled
						className="md:col-span-2"
					/>
					<Button disabled className="md:col-span-2">
						Speichern
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Kriterien</CardTitle>
					<CardDescription>
						Die Liste demonstriert die Struktur der Kriterien. Bearbeitung folgt in späteren Phasen.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3 text-sm">
					{placeholderTemplate.criteria.map((criterion) => (
						<div
							key={criterion.key}
							className="rounded-lg border border-border/60 p-3"
						>
							<div className="flex items-center justify-between gap-4">
								<p className="font-medium">{criterion.title}</p>
								<span className="text-xs text-muted-foreground">Gewicht: {criterion.weight}</span>
							</div>
							<p className="text-muted-foreground">{criterion.description}</p>
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	);
}
