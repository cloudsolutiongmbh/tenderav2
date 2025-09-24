import { PdfExportButton } from "@/components/pdf-export-button";
import {
	MetadataCard,
	MilestonesCard,
	QuestionsCard,
	RequirementsCard,
	SummaryCard,
} from "@/components/analysis-cards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, createFileRoute } from "@tanstack/react-router";

const placeholder = {
	summary: "Exportierter Bericht zeigt die Standard- und Kriterien-Ergebnisse.",
	milestones: [],
	requirements: [],
	questions: [],
	metadata: [],
};

export const Route = createFileRoute("/projekte/$id/export")({
	component: ProjectExportPage,
});

function ProjectExportPage() {
	const { id } = Route.useParams();

	return (
		<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
			<Card>
				<CardHeader className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle>Export</CardTitle>
						<CardDescription>
							Diese Ansicht bildet das spätere PDF ab. Inhalte sind aktuell Platzhalter.
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
						<PdfExportButton />
					</div>
				</CardHeader>
			</Card>

			<section className="print:bg-white print:text-black space-y-6">
				<SummaryCard summary={placeholder.summary} />
				<div className="grid gap-6 lg:grid-cols-2">
					<MilestonesCard milestones={placeholder.milestones} />
					<MetadataCard metadata={placeholder.metadata} />
				</div>
				<RequirementsCard requirements={placeholder.requirements} title="Anforderungen" />
				<QuestionsCard questions={placeholder.questions} />
			</section>
		</div>
	);
}
