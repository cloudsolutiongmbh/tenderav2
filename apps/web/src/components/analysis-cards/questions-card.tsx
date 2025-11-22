import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Citation } from "@/types/citation";

export interface QuestionItem {
	question: string;
	citation?: Citation;
}

interface QuestionsCardProps {
	questions?: QuestionItem[];
	isLoading?: boolean;
}

export function QuestionsCard({ questions = [], isLoading }: QuestionsCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Offene Fragen & Unklarheiten</CardTitle>
				<CardDescription>Punkte für Q&A oder Rückfragen.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3 text-sm">
				{isLoading ? (
					<div className="space-y-2">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-[70%]" />
					</div>
				) : questions.length > 0 ? (
					<ul className="space-y-3">
						{questions.map((item, index) => (
							<li key={`${item.question}-${index}`} className="rounded-lg border border-border/60 p-3">
								<p className="font-medium">{item.question}</p>
								{item.citation ? (
									<p className="mt-2 text-xs text-muted-foreground">
										{formatCitation(item.citation)}
									</p>
								) : null}
							</li>
						))}
					</ul>
				) : (
					<div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center">
						<p className="text-xs text-muted-foreground">
							Noch keine Fragen vorhanden. Starte die Analyse unter "Dokumente".
						</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function formatCitation(citation: Citation) {
	const location = citation.documentName
		? `${citation.documentName} · Seite ${citation.page}`
		: `Seite ${citation.page}`;
	return `Zitat (${location}): „${citation.quote}“`;
}
