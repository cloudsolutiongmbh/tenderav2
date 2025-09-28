import { RouterProvider, createRouter } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import Loader from "./components/loader";
import { routeTree } from "./routeTree.gen";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { deDE } from "@clerk/localizations";
import { ConvexProviderWithClerk } from "convex/react-clerk";
const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

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
				publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
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
