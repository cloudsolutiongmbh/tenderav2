import { ConvexError } from "convex/values";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";

type AuthenticatedCtx = QueryCtx | MutationCtx | ActionCtx;

export interface TenderaIdentity {
	userId: string;
	orgId: string;
	email?: string;
}

const ORG_ID_CLAIM = "org_id";
const TEST_BYPASS = process.env.CONVEX_TEST_BYPASS_AUTH === "1";
const TEST_ORG_ID = process.env.CONVEX_TEST_ORG_ID ?? "test-org";
const TEST_USER_ID = process.env.CONVEX_TEST_USER_ID ?? "user-test";

export async function getIdentityOrThrow(
	ctx: AuthenticatedCtx,
): Promise<TenderaIdentity> {
	const identity = await ctx.auth.getUserIdentity();

	if (!identity) {
		if (TEST_BYPASS) {
			return {
				userId: TEST_USER_ID,
				orgId: TEST_ORG_ID,
				email: "test@tendera.ch",
			};
		}

		throw new ConvexError("Bitte anmelden, um fortzufahren.");
	}

	const orgIdClaim = identity[ORG_ID_CLAIM];
	const orgId = typeof orgIdClaim === "string" ? orgIdClaim : undefined;

	if (!orgId) {
		if (TEST_BYPASS) {
			return {
				userId: identity.subject ?? TEST_USER_ID,
				orgId: TEST_ORG_ID,
				email: identity.email,
			};
		}

		throw new ConvexError(
			"Organisation konnte nicht ermittelt werden. Bitte erneut anmelden.",
		);
	}

	return {
		userId: identity.subject,
		orgId,
		email: identity.email,
	};
}

export function requireOrgFilter(ctx: AuthenticatedCtx, orgId: string) {
	if (!orgId) {
		throw new ConvexError("Organisation erforderlich.");
	}

	return {
		ctx,
		orgId,
		assertDocument<T extends { orgId: string }>(document: T | null) {
			if (!document) {
				return document;
			}
			if (document.orgId !== orgId) {
				throw new ConvexError("Zugriff auf fremde Organisation verweigert.");
			}
			return document;
		},
	};
}
