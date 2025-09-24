import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

interface Citation {
	page: number;
	quote: string;
}

export interface CriteriaDetailData {
	criterionId: string;
	title: string;
	description?: string;
	hints?: string;
	status: "gefunden" | "nicht_gefunden" | "teilweise" | "unbekannt";
	comment?: string;
	answer?: string;
	score?: number;
	weight?: number;
	citations?: Citation[];
}

interface CriteriaDetailProps {
	criterion?: CriteriaDetailData;
}

export function CriteriaDetail({ criterion }: CriteriaDetailProps) {
	if (!criterion) {
		return (
			<div className="flex h-full items-center justify-center rounded-xl border bg-card">
				<p className="text-sm text-muted-foreground">
					Kriterium auswählen, um Details zu sehen.
				</p>
			</div>
		);
	}

	return (
		<Card className="h-full">
			<CardHeader className="gap-4 @container/card-header">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<CardTitle className="text-lg">{criterion.title}</CardTitle>
					<StatusBadge status={mapToAnalysisStatus(criterion.status)} />
				</div>
				{criterion.description ? (
					<CardDescription>{criterion.description}</CardDescription>
				) : null}
				{criterion.hints ? (
					<p className="text-xs text-muted-foreground">Hinweise: {criterion.hints}</p>
				) : null}
			</CardHeader>
			<CardContent className="space-y-5 text-sm">
				{criterion.comment ? (
					<section>
						<h3 className="font-medium">Kommentar</h3>
						<p className="text-muted-foreground">{criterion.comment}</p>
					</section>
				) : null}
				{criterion.answer ? (
					<section>
						<h3 className="font-medium">Antwort</h3>
						<p className="text-muted-foreground">{criterion.answer}</p>
					</section>
				) : null}
				{criterion.citations && criterion.citations.length > 0 ? (
					<section>
						<h3 className="font-medium">Fundstellen</h3>
						<ul className="space-y-2 text-xs text-muted-foreground">
							{criterion.citations.map((citation, index) => (
								<li key={`${citation.page}-${index}`} className="rounded-lg border border-border/60 p-2">
									<strong className="font-medium">Seite {citation.page}</strong>
									<p className="mt-1 italic">„{citation.quote}“</p>
								</li>
							))}
						</ul>
					</section>
				) : null}
				{typeof criterion.score === "number" || typeof criterion.weight === "number" ? (
					<section className="flex flex-wrap items-center gap-6 text-xs text-muted-foreground">
						{typeof criterion.score === "number" ? (
							<div>
								<span className="font-semibold text-foreground">Score:</span> {criterion.score}
							</div>
						) : null}
						{typeof criterion.weight === "number" ? (
							<div>
								<span className="font-semibold text-foreground">Gewichtung:</span> {criterion.weight}
							</div>
						) : null}
					</section>
				) : null}
			</CardContent>
		</Card>
	);
}

function mapToAnalysisStatus(status: CriteriaDetailData["status"]) {
	switch (status) {
		case "gefunden":
			return "fertig" as const;
		case "teilweise":
			return "läuft" as const;
		case "nicht_gefunden":
		case "unbekannt":
			return "fehler" as const;
	}
}
