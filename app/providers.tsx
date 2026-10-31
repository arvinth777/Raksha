"use client";
import { ReactNode, useState } from "react";
import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";
import { ConvexReactClient, useConvexAuth } from "convex/react";
const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = url ? new ConvexReactClient(url) : null;
function Gate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (isLoading) return <p className="p-8">Connecting to Raksha…</p>;
  if (isAuthenticated)
    return (
      <div className="min-h-dvh flex flex-col">
        <div className="h-8 shrink-0 bg-amber-100 text-amber-950 text-xs px-4 flex items-center justify-between gap-3">
          <span>Demo · police alerts go to a stand-in</span>
          <button onClick={() => void signOut()}>Sign out</button>
        </div>
        <div className="flex-1 flex flex-col">{children}</div>
      </div>
    );
  return (
    <main className="min-h-dvh flex items-center justify-center bg-[#fbf9f2] p-6">
      <div className="max-w-sm w-full space-y-5 text-center">
        <h1 className="text-3xl font-bold text-[#003629]">Raksha</h1>
        <p className="text-sm text-[#404945]">
          Supervised demo. Police alerts go to a consenting stand-in.
        </p>
        <button
          className="min-h-[48px] bg-[#1b4d3e] hover:bg-[#003629] text-white font-semibold rounded-lg p-3 w-full disabled:opacity-70"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await signIn("anonymous");
            } catch {
              setError(
                "Could not sign in. Check your connection and try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Signing in…" : "Sign in · no password required"}
        </button>
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      </div>
    </main>
  );
}
export function Providers({ children }: { children: ReactNode }) {
  if (!convex)
    return (
      <p className="p-8">
        Configure NEXT_PUBLIC_CONVEX_URL before starting Raksha.
      </p>
    );
  return (
    <ConvexAuthProvider client={convex}>
      <Gate>{children}</Gate>
    </ConvexAuthProvider>
  );
}
