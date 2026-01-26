import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type CriteriaStatus = "gefunden" | "nicht_gefunden" | "teilweise" | "unbekannt";
type CriteriaSearchMode = "title" | "keywords" | "title+keywords";

export interface CriteriaListItem {
	criterionId: string;
	title: string;
	status: CriteriaStatus;
	keywords?: string[];
}

interface CriteriaListProps {
	items: CriteriaListItem[];
	selectedId?: string;
	onSelect?: (criterionId: string) => void;
	searchModes?: Array<{ value: CriteriaSearchMode; label: string }>;
	defaultSearchMode?: CriteriaSearchMode;
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

export function CriteriaList({
	items,
	selectedId,
	onSelect,
	searchModes,
	defaultSearchMode,
}: CriteriaListProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [searchMode, setSearchMode] = useState<CriteriaSearchMode>(
		defaultSearchMode ?? searchModes?.[0]?.value ?? "title",
	);

	const activeSearchMode = searchModes && searchModes.length > 0 ? searchMode : "title";
	const placeholder =
		activeSearchMode === "keywords"
			? "Stichwort suchen"
			: activeSearchMode === "title+keywords"
				? "Titel oder Stichwort"
				: "Kriterium suchen";

	const filteredItems = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();
		if (!query) return items;
		return items.filter((item) => {
			const title = item.title.toLowerCase();
			const keywords = (item.keywords ?? []).join(" ").toLowerCase();
			if (activeSearchMode === "keywords") {
				return keywords.includes(query);
			}
			if (activeSearchMode === "title+keywords") {
				return title.includes(query) || keywords.includes(query);
			}
			return title.includes(query);
		});
	}, [items, searchQuery, activeSearchMode]);

	return (
		<div className="flex h-full max-h-[70vh] flex-col rounded-xl border bg-card p-2">
			<div className="mb-2 flex items-center gap-2">
				<Input
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					placeholder={placeholder}
					className="h-8 text-sm"
				/>
				{searchModes && searchModes.length > 0 ? (
					<select
						value={searchMode}
						onChange={(event) => setSearchMode(event.target.value as CriteriaSearchMode)}
						className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
						aria-label="Suchbereich"
					>
						{searchModes.map((mode) => (
							<option key={mode.value} value={mode.value}>
								{mode.label}
							</option>
						))}
					</select>
				) : null}
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
