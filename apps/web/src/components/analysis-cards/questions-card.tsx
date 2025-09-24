import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Citation {
	page: number;
	quote: string;
}

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
										Zitat (Seite {item.citation.page}): „{item.citation.quote}“
									</p>
								) : null}
							</li>
						))}
					</ul>
				) : (
					<p className="text-sm text-muted-foreground">
						Derzeit liegen keine offenen Fragen vor.
					</p>
				)}
			</CardContent>
		</Card>
	);
}
