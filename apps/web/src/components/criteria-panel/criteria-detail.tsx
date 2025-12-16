import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CitationList } from "@/components/citation-list";
import type { Citation } from "@/types/citation";

const CRITERION_STATUS_CONFIG: Record<CriteriaDetailData["status"], { label: string; className: string }> = {
	gefunden: { label: "Gefunden", className: "bg-emerald-100 text-emerald-900" },
	teilweise: { label: "Teilweise", className: "bg-amber-100 text-amber-900" },
	nicht_gefunden: { label: "Nicht gefunden", className: "bg-rose-100 text-rose-900" },
	unbekannt: { label: "Nicht bewertet", className: "bg-muted text-muted-foreground" },
};

export interface CriteriaDetailData {
	criterionId: string;
	title: string;
	description?: string;
	hints?: string;
	sourcePages?: number[];
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
					<span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${CRITERION_STATUS_CONFIG[criterion.status].className}`}>
						{CRITERION_STATUS_CONFIG[criterion.status].label}
					</span>
				</div>
				{criterion.description ? (
					<CardDescription>{criterion.description}</CardDescription>
				) : null}
				{criterion.hints ? (
					<p className="text-xs text-muted-foreground">Hinweise: {criterion.hints}</p>
				) : null}
				{criterion.sourcePages && criterion.sourcePages.length > 0 ? (
					<p className="text-xs text-muted-foreground">
						Fundstelle im Pflichtenheft: {formatPages(criterion.sourcePages)}
					</p>
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
						<CitationList citations={criterion.citations} />
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

function formatPages(pages: number[]) {
	const uniqueSorted = Array.from(new Set(pages)).sort((a, b) => a - b);
	const labels = uniqueSorted.map((page) => `Seite ${page}`);
	if (labels.length <= 1) {
		return labels[0] ?? "";
	}
	if (labels.length === 2) {
		return `${labels[0]} und ${labels[1]}`;
	}
	const last = labels[labels.length - 1];
	return `${labels.slice(0, -1).join(", ")}, und ${last}`;
}
