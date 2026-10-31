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
      <form
        className="max-w-sm w-full space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const form = new FormData(e.currentTarget);
          try {
            await signIn("anonymous", { code: String(form.get("code")) });
          } catch {
            setError(
              "That invitation was not accepted. Check your demo access code.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1 className="text-3xl font-bold text-[#003629]">Raksha</h1>
        <p>
          Enter your private demo invitation. Participant and operator
          permissions are checked by the backend.
        </p>
        <label className="block">
          Demo access code
          <input
            className="block border border-gray-500 rounded-lg p-3 w-full mt-2"
            name="code"
            type="password"
            required
            autoComplete="off"
          />
        </label>
        <button
          className="bg-[#1b4d3e] text-white rounded-lg p-3 w-full"
          disabled={busy}
        >
          {busy ? "Connecting…" : "Enter demo"}
        </button>
        <p role="alert">{error}</p>
      </form>
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
