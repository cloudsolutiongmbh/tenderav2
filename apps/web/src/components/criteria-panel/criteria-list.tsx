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
		<div className="rounded-xl border bg-card">
			<ul className="divide-y">
				{items.length === 0 ? (
					<li className="p-4 text-sm text-muted-foreground">
						Noch keine Kriterien vorhanden.
					</li>
				) : (
					items.map((item) => {
						const isActive = item.criterionId === selectedId;
						return (
							<li key={item.criterionId}>
								<button
									type="button"
									onClick={() => onSelect?.(item.criterionId)}
									className={cn(
										"flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors",
										isActive ? "bg-primary/10" : "hover:bg-muted/60",
									)}
								>
									<span className="font-medium">{item.title}</span>
									<span className={cn("rounded-full px-2 py-0.5 text-xs", STATUS_CLASS[item.status])}>
										{STATUS_LABEL[item.status]}
									</span>
								</button>
							</li>
						);
					})
				)}
			</ul>
		</div>
	);
}

export type { CriteriaStatus };
