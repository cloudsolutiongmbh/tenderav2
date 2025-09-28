import { createContext, useCallback, useContext, useMemo } from "react";
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

	return useSyncExternalStore(
		(backListener) => backend.subscribe(backListener),
		() => backend.query(key.name, key.args),
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

export function useQueries() {
	throw new Error("useQueries wird im Mock nicht unterstützt.");
}

export function useSubscription() {
	throw new Error("useSubscription wird im Mock nicht unterstützt.");
}
