import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";

/**
 * ctx authentication configuration
 *
 * Uses Cognito OIDC for authentication. On first login, the user
 * is provisioned on the ctx host (Unix user + home directory).
 */
export const authConfig: NextAuthConfig = {
  providers: [
    {
      id: "cognito",
      name: "Cognito",
      type: "oidc",
      issuer: process.env.COGNITO_ISSUER,
      clientId: process.env.COGNITO_CLIENT_ID,
      clientSecret: process.env.COGNITO_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "openid email profile",
        },
      },
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.preferred_username || profile.email?.split("@")[0],
          email: profile.email,
          image: null,
        };
      },
    },
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.sub = profile.sub as string;
        token.email = profile.email as string;
        token.preferredUsername =
          (profile.preferred_username as string) ||
          (profile.email as string)?.split("@")[0];

        // Derive the ctx Unix username
        token.ctxUsername = deriveUsername(
          token.preferredUsername as string,
          token.email as string
        );

        // Trigger provisioning on first login
        token.needsProvisioning = true;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        (session.user as any).ctxUsername = token.ctxUsername;
        (session.user as any).preferredUsername = token.preferredUsername;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isApiHealth = nextUrl.pathname === "/api/health";

      // Always allow health check
      if (isApiHealth) return true;

      // Require auth for everything else
      if (!isLoggedIn) return false;

      return true;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  trustHost: true,
};

/**
 * Derive a Unix-safe username from Cognito claims.
 * Rules: lowercase, alphanumeric + hyphens only, max 32 chars.
 */
function deriveUsername(preferredUsername: string, email: string): string {
  const raw = preferredUsername || email?.split("@")[0] || "user";
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
