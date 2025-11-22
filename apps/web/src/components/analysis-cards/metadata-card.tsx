import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Citation } from "@/types/citation";

export interface MetadataItem {
	label: string;
	value: string;
	citation?: Citation;
}

interface MetadataCardProps {
	metadata?: MetadataItem[];
	isLoading?: boolean;
}

export function MetadataCard({ metadata = [], isLoading }: MetadataCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Metadaten</CardTitle>
				<CardDescription>Rahmendaten aus der Ausschreibung.</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="space-y-2">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-[85%]" />
						<Skeleton className="h-4 w-[60%]" />
					</div>
				) : metadata.length > 0 ? (
					<dl className="grid gap-3 text-sm sm:grid-cols-2">
						{metadata.map((item, index) => (
							<div
								key={`${item.label}-${index}`}
								className="rounded-lg border border-border/60 p-3 break-words"
							>
								<dt className="text-xs uppercase text-muted-foreground break-words">
									{item.label}
								</dt>
								<dd className="mt-1 font-medium break-words">{item.value}</dd>
								{item.citation ? (
									<p className="mt-2 text-xs text-muted-foreground break-words">
										{formatCitation(item.citation)}
									</p>
								) : null}
							</div>
						))}
					</dl>
				) : (
					<div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center">
						<p className="text-xs text-muted-foreground">
							Noch keine Metadaten vorhanden. Starte die Analyse unter "Dokumente".
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
