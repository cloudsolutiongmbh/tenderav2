import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AnalysisEmptyState } from "@/components/analysis-empty-state";
import type { Citation } from "@/types/citation";

export interface QuestionItem {
	question: string;
	citation?: Citation;
}

interface QuestionsCardProps {
	questions?: QuestionItem[];
	isLoading?: boolean;
	emptyState?: {
		title: string;
		description: string;
		action?: ReactNode;
	};
}

export function QuestionsCard({ questions = [], isLoading, emptyState }: QuestionsCardProps) {
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
					<AnalysisEmptyState
						title={emptyState?.title ?? "Noch keine Fragen"}
						description={
							emptyState?.description ??
							"Führe die Analyse durch, um offene Punkte zu sehen."
						}
						action={emptyState?.action}
					/>
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
