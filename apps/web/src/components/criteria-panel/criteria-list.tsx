import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
	const [activeSearch, setActiveSearch] = useState("");

	const filteredItems = useMemo(() => {
		if (!activeSearch.trim()) return items;
		const query = activeSearch.toLowerCase();
		return items.filter((item) => item.title.toLowerCase().includes(query));
	}, [items, activeSearch]);

	const handleSearch = () => {
		setActiveSearch(searchQuery);
	};

	return (
		<div className="flex h-full max-h-[70vh] flex-col rounded-xl border bg-card p-3">
			<div className="mb-3 flex gap-1">
				<Input
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && handleSearch()}
					placeholder="Kriterium suchen"
					className="h-8 text-sm"
				/>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={handleSearch}
					className="h-8 shrink-0"
				>
					Suchen
				</Button>
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
				<div className="grid gap-2 overflow-y-auto pr-1">
					{filteredItems.map((item) => {
						const isActive = item.criterionId === selectedId;
						return (
							<button
								key={item.criterionId}
								type="button"
								onClick={() => onSelect?.(item.criterionId)}
								className={cn(
									"flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
									isActive
										? "border-primary bg-primary/10 shadow-sm"
										: "border-transparent bg-background hover:border-border/60 hover:bg-muted/40",
								)}
							>
								<span className="min-w-0 flex-1 truncate font-medium leading-snug text-foreground">
									{item.title}
								</span>
								<span
									className={cn(
										"shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold",
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
