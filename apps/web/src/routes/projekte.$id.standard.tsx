import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Link, createFileRoute } from "@tanstack/react-router";

import {
	MetadataCard,
	MilestonesCard,
	QuestionsCard,
	RequirementsCard,
	SummaryCard,
} from "@/components/analysis-cards";
import { StatusBadge } from "@/components/status-badge";

const placeholderStandardResult = {
	summary:
		"Die Ausschreibung umfasst den Neubau eines Schulhauses inkl. Mensa und Sportinfrastruktur. Schwerpunkt liegt auf nachhaltiger Bauweise und termingerechter Übergabe bis 2026.",
	milestones: [
		{ title: "Einreichung Angebot", date: "2024-03-15", citation: { page: 4, quote: "Eingabefrist ist der 15. März 2024" } },
		{ title: "Fragerunde", date: "2024-02-20" },
	],
	requirements: [
		{ title: "Minergie-P Standard", category: "Technisch" },
		{ title: "Erfahrung Schulbau", category: "Eignung" },
	],
	questions: [
		{ question: "Gibt es Vorgaben zur Möblierung?", citation: { page: 7, quote: "Möblierung ist optional" } },
	],
	metadata: [
		{ label: "Ausschreibungsnummer", value: "ZH-2024-001" },
		{ label: "Vergabestelle", value: "Stadt Winterthur" },
	],
};

export const Route = createFileRoute("/projekte/$id/standard")({
	component: ProjectStandardPage,
});

function ProjectStandardPage() {
	const { id } = Route.useParams();

	return (
		<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
			<Card>
				<CardHeader className="gap-2">
					<CardTitle>Projekt {id}</CardTitle>
					<CardDescription>
						Dies ist eine Platzhalteransicht. Daten werden in den nächsten Phasen über Convex geladen.
					</CardDescription>
					<div className="flex flex-wrap items-center gap-3">
						<StatusBadge status="fertig" />
						<nav className="flex flex-wrap gap-2 text-sm">
							<Link
								to="/projekte/$id/standard"
								params={{ id }}
								className="rounded-md bg-primary px-3 py-1 text-primary-foreground"
							>
								Standard
							</Link>
							<Link
								to="/projekte/$id/kriterien"
								params={{ id }}
								className="rounded-md border px-3 py-1"
							>
								Kriterien
							</Link>
							<Link
								to="/projekte/$id/dokumente"
								params={{ id }}
								className="rounded-md border px-3 py-1"
							>
								Dokumente
							</Link>
						</nav>
					</div>
				</CardHeader>
			</Card>

			<section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
				<div className="space-y-6">
					<SummaryCard summary={placeholderStandardResult.summary} />
					<MilestonesCard milestones={placeholderStandardResult.milestones} />
					<RequirementsCard requirements={placeholderStandardResult.requirements} />
				</div>
				<div className="space-y-6">
					<QuestionsCard questions={placeholderStandardResult.questions} />
					<MetadataCard metadata={placeholderStandardResult.metadata} />
				</div>
			</section>
		</div>
	);
}
