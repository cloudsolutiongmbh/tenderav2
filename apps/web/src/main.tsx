import { RouterProvider, createRouter } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import Loader from "./components/loader";
import { routeTree } from "./routeTree.gen";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { deDE } from "@clerk/localizations";
import { ConvexProviderWithClerk } from "convex/react-clerk";

if (import.meta.env.VITE_E2E_MOCK === "1") {
	void import("./testing/mockConvexBackend");
}
const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

if (!clerkPublishableKey && import.meta.env.VITE_E2E_MOCK !== "1") {
	throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY. Set it in the web app environment.");
}

if (import.meta.env.PROD && clerkPublishableKey?.startsWith("pk_test_")) {
	// Warn to avoid production builds accidentally using a dev key which often resolves to a non-public frontend API.
	console.warn("Using a Clerk test publishable key in production.");
}

const isE2EMock = import.meta.env.VITE_E2E_MOCK === "1";

const router = createRouter({
	routeTree,
	defaultPreload: "intent",
	defaultPendingComponent: () => <Loader />,
	context: {},
	Wrap: function WrapComponent({ children }: { children: React.ReactNode }) {
		if (isE2EMock) {
			return (
				<ClerkProvider publishableKey="test" localization={deDE}>
					<ConvexProvider client={convex}>{children}</ConvexProvider>
				</ClerkProvider>
			);
		}

		return (
			<ClerkProvider
				publishableKey={clerkPublishableKey!}
				localization={deDE}
			>
				<ConvexProviderWithClerk client={convex} useAuth={useAuth}>
					{children}
				</ConvexProviderWithClerk>
			</ClerkProvider>
		);
	},
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.getElementById("app");

if (!rootElement) {
	throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(<RouterProvider router={router} />);
}
