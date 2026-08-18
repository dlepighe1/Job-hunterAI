import { AppShell } from "@/components/AppShell";
import { ObsidianBackdrop } from "@/components/backdrop/ObsidianBackdrop";

/**
 * The authenticated shell's route layout.
 *
 * Deliberately a server component holding almost nothing. Its whole job is to render
 * `ObsidianBackdrop` on the server — spec §3 puts the backdrop layers on `.obsidian-app` as
 * well as `.marketing-shell`, and for most of this redesign's life only the marketing side
 * had them — and hand it to the client shell as a prop.
 *
 * If this file ever gains `"use client"`, the backdrop stops being server-rendered and the
 * contour field starts shipping as JavaScript. Nothing would look wrong. `mount.test.ts`
 * fails instead.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell backdrop={<ObsidianBackdrop />}>{children}</AppShell>;
}
