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
  if (isLoading)
    return (
      <p className="min-h-dvh grid place-items-center bg-paper text-ink-3 text-sm">
        Connecting to Raksha…
      </p>
    );
  if (isAuthenticated)
    return (
      <div className="min-h-dvh flex flex-col">
        <div className="h-8 shrink-0 bg-ink text-paper text-xs px-4 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-[10px] tracking-wider px-1.5 py-0.5 rounded bg-paper/15">
              DEMO
            </span>
            <span className="truncate text-paper/80">
              Police alerts reach a consenting stand-in
            </span>
          </span>
          <button
            className="shrink-0 min-h-[44px] px-2 -my-2 text-paper/80 hover:text-paper underline-offset-2 hover:underline"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
        <div className="flex-1 flex flex-col">{children}</div>
      </div>
    );
  return (
    <main className="min-h-dvh flex flex-col justify-between bg-paper text-ink px-6 py-10">
      <p className="font-mono text-xs text-ink-3">Supervised demo</p>
      <div className="max-w-sm w-full mx-auto space-y-6">
        <div className="space-y-3">
          <h1 className="font-display lc text-7xl tracking-tight text-accent">
            Raksha
          </h1>
          <p className="text-lg text-ink-2 leading-snug">
            A voice that stays on the line when you feel unsafe, and alerts help
            when you ask.
          </p>
        </div>
        <button
          className="w-full min-h-[52px] rounded-full bg-accent text-accent-ink font-semibold transition-colors duration-150 ease-out hover:bg-accent/90 active:translate-y-px disabled:opacity-60"
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
        <p role="alert" className="text-sm text-danger min-h-5">
          {error}
        </p>
      </div>
      <p className="max-w-sm mx-auto text-xs text-ink-3 text-center">
        Police alerts in this demo reach a consenting stand-in, never a real
        emergency service.
      </p>
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
