import {
	MetadataCard,
	MilestonesCard,
	QuestionsCard,
	RequirementsCard,
	SummaryCard,
} from "@/components/analysis-cards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createFileRoute } from "@tanstack/react-router";

const placeholderShare = {
	projectName: "Schulhaus Winterthur",
	summary: "Freigabeansicht zeigt die wichtigsten Ergebnisse ohne Bearbeitungsmöglichkeiten.",
	milestones: [],
	requirements: [],
	questions: [],
	metadata: [],
};

export const Route = createFileRoute("/share/$token")({
	component: SharePage,
});

function SharePage() {
	const { token } = Route.useParams();

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
			<Card>
				<CardHeader>
					<CardTitle>Freigabeansicht</CardTitle>
					<CardDescription>
						Dies ist eine statische Vorschau. In den nächsten Phasen wird der Token {token} gegen Convex validiert.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						Projekt: {placeholderShare.projectName}
					</p>
				</CardContent>
			</Card>

			<section className="space-y-6">
				<SummaryCard summary={placeholderShare.summary} />
				<div className="grid gap-6 lg:grid-cols-2">
					<MilestonesCard milestones={placeholderShare.milestones} />
					<MetadataCard metadata={placeholderShare.metadata} />
				</div>
				<RequirementsCard requirements={placeholderShare.requirements} />
				<QuestionsCard questions={placeholderShare.questions} />
			</section>
		</div>
	);
}
