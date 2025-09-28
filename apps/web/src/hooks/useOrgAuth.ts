import { useAuth } from "@clerk/clerk-react";
import { useConvexAuth } from "convex/react";

export type OrgAuthStatus = "loading" | "signedOut" | "missingOrg" | "ready";

export type OrgAuthState = ReturnType<typeof useAuth> & {
	orgStatus: OrgAuthStatus;
	authReady: boolean;
};

export function useOrgAuth(): OrgAuthState {
	const auth = useAuth();
	const { isLoading: convexLoading, isAuthenticated } = useConvexAuth();

	const orgStatus: OrgAuthStatus = !auth.isLoaded || convexLoading
		? "loading"
		: !auth.isSignedIn
			? "signedOut"
			: !auth.orgId
				? "missingOrg"
				: "ready";

	return {
		...auth,
		orgStatus,
		authReady: orgStatus === "ready" && isAuthenticated,
	};
}
