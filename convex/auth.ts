import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";
// Demo: one-tap sign-in, no password. Every demo user gets the operator role
// (live calls, ops dashboard, police desk). Calls still only reach TEST_ALLOWED_PHONES.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Anonymous({
      profile: () => ({
        name: "Demo operator",
        role: "operator",
        isAnonymous: true,
      }),
    }),
  ],
});
