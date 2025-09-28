import type { PropsWithChildren } from "react";
import { ConvexProvider } from "./mockConvexReact";

export function ConvexProviderWithClerk({ children }: PropsWithChildren<{ client?: any; useAuth?: any }>) {
	return <ConvexProvider client={undefined}>{children}</ConvexProvider>;
}
