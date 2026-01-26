import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import { useSyncExternalStore } from "react";

import { getMockBackend, getFunctionNameFromReference } from "./mockConvexBackend";

const BackendContext = createContext(getMockBackend());

export class ConvexReactClient {
	constructor(public address: string) {}
}

export function ConvexProvider({ children }: { children: React.ReactNode; client?: ConvexReactClient }) {
	const backend = useMemo(() => getMockBackend(), []);
	return <BackendContext.Provider value={backend}>{children}</BackendContext.Provider>;
}

function useBackend() {
	const backend = useContext(BackendContext);
	return backend;
}

export function useQuery(reference: any, args?: any) {
	const backend = useBackend();
	const key = useMemo(() => ({ name: getFunctionNameFromReference(reference), args: args ?? {} }), [reference, args]);
	const snapshotRef = useRef<{ value: unknown; serialized: string } | null>(null);

	return useSyncExternalStore(
		(backListener) => backend.subscribe(backListener),
		() => {
			const next = backend.query(key.name, key.args);
			const serialized = stableSerialize(next);
			const previous = snapshotRef.current;
			if (previous && previous.serialized === serialized) {
				return previous.value;
			}
			snapshotRef.current = { value: next, serialized };
			return next;
		},
		() => backend.query(key.name, key.args),
	);
}

export function useMutation(reference: any) {
	const backend = useBackend();
	const name = useMemo(() => getFunctionNameFromReference(reference), [reference]);

	return useCallback(
		async (args: any) => backend.mutation(name, args ?? {}),
		[backend, name],
	);
}

export function useAction(reference: any) {
	const backend = useBackend();
	const name = useMemo(() => getFunctionNameFromReference(reference), [reference]);
	return useCallback(
		async (args: any) => backend.mutation(name, args ?? {}),
		[backend, name],
	);
}

export function useConvex() {
	return useBackend();
}

export function useConvexConnectionState() {
	return "connected" as const;
}

export function useConvexAuth() {
	return { isAuthenticated: true, isLoading: false };
}

export function useQueries() {
	throw new Error("useQueries wird im Mock nicht unterstützt.");
}

export function useSubscription() {
	throw new Error("useSubscription wird im Mock nicht unterstützt.");
}

function stableSerialize(value: unknown) {
	try {
		return JSON.stringify(value, (_key, val) => {
			if (val && typeof val === "object" && !Array.isArray(val)) {
				const sorted: Record<string, unknown> = {};
				for (const key of Object.keys(val).sort()) {
					sorted[key] = (val as Record<string, unknown>)[key];
				}
				return sorted;
			}
			return val;
		});
	} catch {
		return String(value);
	}
}
