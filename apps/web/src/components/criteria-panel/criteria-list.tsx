import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

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
	const [searchQuery, setSearchQuery] = useState("");

	const filteredItems = useMemo(() => {
		if (!searchQuery.trim()) return items;
		const query = searchQuery.toLowerCase();
		return items.filter((item) => item.title.toLowerCase().includes(query));
	}, [items, searchQuery]);

	return (
		<div className="flex h-full max-h-[70vh] flex-col rounded-xl border bg-card p-2">
			<div className="mb-2">
				<Input
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					placeholder="Kriterium suchen"
					className="h-8 text-sm"
				/>
			</div>
			{items.length === 0 ? (
				<p className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
					Noch keine Kriterien vorhanden.
				</p>
			) : filteredItems.length === 0 ? (
				<p className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
					Keine Treffer
				</p>
			) : (
				<div className="flex flex-col gap-1 overflow-y-auto overflow-x-hidden">
					{filteredItems.map((item) => {
						const isActive = item.criterionId === selectedId;
						return (
							<button
								key={item.criterionId}
								type="button"
								onClick={() => onSelect?.(item.criterionId)}
								className={cn(
									"w-full rounded-md border px-2 py-1.5 text-left text-sm transition-colors",
									isActive
										? "border-primary bg-primary/10"
										: "border-transparent hover:bg-muted/40",
								)}
							>
								<span className="block truncate font-medium text-foreground">
									{item.title}
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
