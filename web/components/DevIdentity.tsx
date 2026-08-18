"use client";

/**
 * Carries the dev-mode identity to client components.
 *
 * `DEV_BYPASS_AUTH` is deliberately NOT a `NEXT_PUBLIC_` variable, because a flag that disables
 * authentication has no business being inlined into the browser bundle, and a second public
 * mirror of it would be a second thing that could be set alone and disagree with the first.
 *
 * So the root layout, which is a server component, reads the private flag once and passes
 * the result down through this context. Client components ask the context rather than the
 * environment, and there is still exactly one flag.
 *
 * The value is cosmetic only. Nothing here grants access: every route and every API handler
 * decides for itself via `isDevMode()` on the server. A tampered context changes a greeting.
 */

import { createContext, useContext } from "react";

export interface DevIdentity {
  active: boolean;
  name: string;
  email: string;
}

const Context = createContext<DevIdentity>({ active: false, name: "", email: "" });

export function DevIdentityProvider({
  value,
  children,
}: {
  value: DevIdentity;
  children: React.ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** The fixture identity, or `active: false` in every normal session. */
export function useDevIdentity(): DevIdentity {
  return useContext(Context);
}
