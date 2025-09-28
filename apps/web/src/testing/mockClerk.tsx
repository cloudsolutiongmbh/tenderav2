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

export function SignInButton({ children }: PropsWithChildren<{ mode?: string }>) {
	return <>{children}</>;
}

export function OrganizationProfile() {
	return (
		<div data-testid="mock-organization-profile" className="rounded-md border p-4 text-sm text-muted-foreground">
			Organisation im Testmodus
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
		isSignedIn: true,
		getToken: async () => null,
	};
}
