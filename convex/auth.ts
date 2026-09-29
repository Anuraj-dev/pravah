import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { query } from "./_generated/server";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import { ownerConvexTokenPlugin } from "./ownerConvexToken";
import { getAuthTrustedOrigins, getPrimarySiteUrl } from "./origins";

function readEnv() {
  return (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;
}

export const authComponent = createClient<DataModel>(components.betterAuth);

export function createAuth(ctx: GenericCtx<DataModel>) {
  const env = readEnv();
  const siteUrl = getPrimarySiteUrl();
  const googleClientId = env?.GOOGLE_OAUTH_CLIENT_ID;
  const googleClientSecret = env?.GOOGLE_OAUTH_CLIENT_SECRET;

  return betterAuth({
    trustedOrigins: getAuthTrustedOrigins(),
    database: authComponent.adapter(ctx),
    socialProviders:
      googleClientId && googleClientSecret
        ? {
            google: {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
              prompt: "select_account",
            },
          }
        : {},
    user: {
      additionalFields: {
        name: {
          type: "string",
          required: false,
        },
      },
    },
    plugins: [
      crossDomain({ siteUrl }),
      convex({
        authConfig,
        // The login session is already 7 days. This is the Convex JWT.
        // A 15-minute default re-authenticates the socket and re-runs every
        // live query. One day keeps a revoked token bounded.
        jwt: { expirationSeconds: 60 * 60 * 24 },
      }),
      // Server-only endpoint that mints a short-lived Convex token for an
      // automation credential's owner. Not mounted as an HTTP route.
      ownerConvexTokenPlugin({ convexSiteUrl: readEnv()?.CONVEX_SITE_URL ?? "" }),
    ],
  });
}

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await authComponent.getAuthUser(ctx);
  },
});
