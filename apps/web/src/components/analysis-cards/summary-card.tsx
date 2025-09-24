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
					<p className="text-sm text-muted-foreground">
						Sobald eine Analyse abgeschlossen ist, erscheint hier die Zusammenfassung.
					</p>
				)}
			</CardContent>
		</Card>
	);
}
