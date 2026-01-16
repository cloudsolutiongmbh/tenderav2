import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AnalysisEmptyState } from "@/components/analysis-empty-state";

interface SummaryCardProps {
	summary?: string;
	isLoading?: boolean;
	emptyState?: {
		title: string;
		description: string;
		action?: ReactNode;
	};
}

export function SummaryCard({ summary, isLoading, emptyState }: SummaryCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Zusammenfassung</CardTitle>
				<CardDescription>Überblick über die wichtigsten Punkte der Ausschreibung.</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="space-y-2">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-[85%]" />
						<Skeleton className="h-4 w-[70%]" />
					</div>
				) : summary ? (
					<p className="whitespace-pre-wrap text-sm leading-relaxed">{summary}</p>
				) : (
					<AnalysisEmptyState
						title={emptyState?.title ?? "Noch keine Zusammenfassung"}
						description={
							emptyState?.description ??
							"Starte die Analyse, sobald Dokumente und Textseiten verfügbar sind."
						}
						action={emptyState?.action}
					/>
				)}
			</CardContent>
		</Card>
	);
}
