import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface SummaryCardProps {
	summary?: string;
	isLoading?: boolean;
}

export function SummaryCard({ summary, isLoading }: SummaryCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Executive Summary</CardTitle>
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
					<div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
						<p className="text-sm font-medium text-foreground">
							Keine Analyse vorhanden
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Gehe zu "Dokumente", um Dateien hochzuladen und die Analyse zu starten.
						</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
