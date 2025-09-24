import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ShareLinkProps {
	token?: string;
	expiresAt?: number;
	onCreate?: (ttlDays: number) => void;
	isCreating?: boolean;
}

export function ShareLink({ token, expiresAt, onCreate, isCreating }: ShareLinkProps) {
	const [ttlDays, setTtlDays] = useState(7);
	const shareUrl = useMemo(() => {
		if (!token) {
			return null;
		}
		const origin = typeof window !== "undefined" ? window.location.origin : "";
		return `${origin}/share/${token}`;
	}, [token]);

	return (
		<div className="space-y-3 rounded-xl border bg-card p-4">
			<div className="flex flex-wrap items-center gap-3">
				<Input
					type="number"
					min={1}
					max={30}
					value={ttlDays}
					onChange={(event) => setTtlDays(Number(event.target.value) || 1)}
					className="w-24"
					aria-label="Gültigkeit (Tage)"
				/>
				<Button type="button" onClick={() => onCreate?.(ttlDays)} disabled={isCreating}>
					Link erstellen
				</Button>
			</div>
			{shareUrl ? (
				<div className="space-y-1 text-sm">
					<p className="font-medium text-foreground">Freigabelink</p>
					<button
						type="button"
						onClick={() => navigator.clipboard.writeText(shareUrl)}
						className="text-left text-muted-foreground underline underline-offset-2"
					>
						{shareUrl}
					</button>
					<p className="text-xs text-muted-foreground">
						Gültig bis: {expiresAt ? new Date(expiresAt).toLocaleString("de-CH") : "wird nach Erstellung angezeigt"}
					</p>
				</div>
			) : (
				<p className="text-sm text-muted-foreground">
					Noch kein Link erstellt.
				</p>
			)}
		</div>
	);
}
