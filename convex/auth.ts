import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";
// Invite-gated demo identities. Roles are assigned here, never from client input.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Anonymous({
      profile(params) {
        if (typeof params.code !== "string" || params.code.length < 20)
          throw Error("Invalid demo invitation");
        if (
          process.env.DEMO_OPERATOR_CODE &&
          params.code === process.env.DEMO_OPERATOR_CODE
        )
          return { name: "Demo operator", role: "operator", isAnonymous: true };
        if (
          process.env.DEMO_TESTER_CODE &&
          params.code === process.env.DEMO_TESTER_CODE
        )
          return {
            name: "Demo participant",
            role: "tester",
            isAnonymous: true,
          };
        throw Error("Invalid demo invitation");
      },
    }),
  ],
});
