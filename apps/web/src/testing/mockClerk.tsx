import { createContext, useContext, type PropsWithChildren } from "react";

type MockUser = {
	id: string;
	emailAddresses: Array<{ emailAddress: string }>;
	imageUrl?: string;
	fullName?: string;
};

type MockClerkState = {
	user: MockUser;
	signOut: () => void;
};

const defaultUser: MockUser = {
	id: "user_test",
	emailAddresses: [{ emailAddress: "e2e@test.tendera.ch" }],
	imageUrl: undefined,
	fullName: "E2E Nutzer",
};
const defaultOrgId = "org_test";
const defaultOrgSlug = "test-org";

const ClerkContext = createContext<MockClerkState>({
	user: defaultUser,
	signOut: () => {},
});

export function ClerkProvider({ children }: PropsWithChildren<{ publishableKey?: string }>) {
	return (
		<ClerkContext.Provider value={{ user: defaultUser, signOut: () => {} }}>
			{children}
		</ClerkContext.Provider>
	);
}

export function SignedIn({ children }: PropsWithChildren) {
	return <>{children}</>;
}

export function SignedOut({ children }: PropsWithChildren) {
	return <></>;
}

export function SignInButton({ children }: PropsWithChildren<{ mode?: string; forceRedirectUrl?: string; signUpForceRedirectUrl?: string }>) {
	return <>{children}</>;
}

export function ClerkLoaded({ children }: PropsWithChildren) {
	return <>{children}</>;
}

export function ClerkLoading({ children }: PropsWithChildren) {
	return <>{children}</>;
}

export function OrganizationProfile() {
	return (
		<div data-testid="mock-organization-profile" className="rounded-md border p-4 text-sm text-muted-foreground">
			Organisation im Testmodus
		</div>
	);
}

export function OrganizationSwitcher({ children }: PropsWithChildren<{ hidePersonal?: boolean }>) {
	return (
		<div data-testid="mock-organization-switcher" className="rounded-md border p-3 text-sm text-muted-foreground">
			Organisation wechseln (Testmodus)
			{children}
		</div>
	);
}

export function CreateOrganization({ children }: PropsWithChildren<{ afterCreateOrganizationUrl?: string }>) {
	return (
		<div data-testid="mock-create-organization" className="rounded-md border p-3 text-sm text-muted-foreground">
			Organisation erstellen (Testmodus)
			{children}
		</div>
	);
}

export function UserProfile() {
	return (
		<div data-testid="mock-user-profile" className="rounded-md border p-4 text-sm text-muted-foreground">
			Profil im Testmodus
		</div>
	);
}

export function useUser() {
	const state = useContext(ClerkContext);
	return { user: state.user };
}

export function useClerk() {
	const state = useContext(ClerkContext);
	return { signOut: state.signOut };
}

export function useAuth() {
	return {
		isLoaded: true,
		isSignedIn: true,
		orgId: defaultOrgId,
		orgSlug: defaultOrgSlug,
		userId: defaultUser.id,
		sessionId: "session_test",
		getToken: async () => null,
	};
}
