import { useMemo, useState } from "react";

import { CriteriaDetail, CriteriaList } from "@/components/criteria-panel";
import type { CriteriaListItem } from "@/components/criteria-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, createFileRoute } from "@tanstack/react-router";

const placeholderCriteria = [
	{
		criterionId: "C1",
		title: "Nachhaltigkeitskonzept",
		status: "gefunden" as const,
		description: "Nachweis eines zertifizierten Energiekonzepts",
		comment:
			"Die Anforderungen werden erfüllt. Es liegt ein Minergie-P Zertifikat sowie ein Monitoring-Konzept vor.",
		citations: [{ page: 12, quote: "Kapitel Nachhaltigkeit beschreibt das Konzept ausführlich." }],
	},
	{
		criterionId: "C2",
		title: "Referenzen",
		status: "teilweise" as const,
		description: "Mindestens zwei Referenzen im Schulbau",
		comment: "Nur eine Referenz vergleichbarer Grösse vorhanden.",
		citations: [{ page: 18, quote: "Referenzliste führt eine Schule mit 400 Schülern auf." }],
	},
	{
		criterionId: "C3",
		title: "Projektleiter verfügbar",
		status: "nicht_gefunden" as const,
		description: "Benennung eines deutschsprachigen Projektleiters",
		comment: "Keine namentliche Benennung im Angebot gefunden.",
	},
];

export const Route = createFileRoute("/projekte/$id/kriterien")({
	component: ProjectCriteriaPage,
});

function ProjectCriteriaPage() {
	const { id } = Route.useParams();
	const items: CriteriaListItem[] = useMemo(
		() =>
			placeholderCriteria.map((item) => ({
				criterionId: item.criterionId,
				title: item.title,
				status: item.status,
			})),
		[],
	);

	const [selectedId, setSelectedId] = useState<string | undefined>(items[0]?.criterionId);
	const activeCriterion = placeholderCriteria.find((item) => item.criterionId === selectedId);

	return (
		<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
			<Card>
				<CardHeader className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle>Kriterien-Analyse</CardTitle>
						<CardDescription>
							Die Ansicht zeigt eine beispielhafte Auswertung – die Live-Daten folgen in späteren Phasen.
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
							to="/projekte/$id/dokumente"
							params={{ id }}
							className="rounded-md border px-3 py-1 text-sm"
						>
							Dokumente
						</Link>
						<Button size="sm" disabled>
							Analyse starten
						</Button>
					</div>
				</CardHeader>
			</Card>

			<section className="grid gap-6 lg:grid-cols-[280px_1fr]">
				<div className="lg:sticky lg:top-20">
					<CriteriaList items={items} selectedId={selectedId} onSelect={setSelectedId} />
				</div>
				<CriteriaDetail criterion={activeCriterion} />
			</section>
		</div>
	);
}
