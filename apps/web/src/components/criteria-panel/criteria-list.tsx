import { cn } from "@/lib/utils";

type CriteriaStatus = "gefunden" | "nicht_gefunden" | "teilweise" | "unbekannt";

export interface CriteriaListItem {
	criterionId: string;
	title: string;
	status: CriteriaStatus;
}

interface CriteriaListProps {
	items: CriteriaListItem[];
	selectedId?: string;
	onSelect?: (criterionId: string) => void;
}

const STATUS_LABEL: Record<CriteriaStatus, string> = {
	gefunden: "Gefunden",
	nicht_gefunden: "Nicht gefunden",
	teilweise: "Teilweise",
	unbekannt: "Nicht bewertet",
};

const STATUS_CLASS: Record<CriteriaStatus, string> = {
	gefunden: "bg-emerald-100 text-emerald-900",
	nicht_gefunden: "bg-rose-100 text-rose-900",
	teilweise: "bg-amber-100 text-amber-900",
	unbekannt: "bg-muted text-muted-foreground",
};

export function CriteriaList({ items, selectedId, onSelect }: CriteriaListProps) {
	return (
		<div className="rounded-xl border bg-card p-3">
			{items.length === 0 ? (
				<p className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
					Noch keine Kriterien vorhanden.
				</p>
			) : (
				<div className="grid gap-2">
					{items.map((item) => {
						const isActive = item.criterionId === selectedId;
						return (
							<button
								key={item.criterionId}
								type="button"
								onClick={() => onSelect?.(item.criterionId)}
								className={cn(
									"flex w-full items-start justify-between gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors",
									isActive
										? "border-primary bg-primary/10 shadow-sm"
										: "border-transparent bg-background hover:border-border/60 hover:bg-muted/40",
								)}
							>
								<span className="font-medium leading-snug text-foreground">
									{item.title}
								</span>
								<span
									className={cn(
										"shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
										STATUS_CLASS[item.status],
									)}
							>
									{STATUS_LABEL[item.status]}
								</span>
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}

export type { CriteriaStatus };
