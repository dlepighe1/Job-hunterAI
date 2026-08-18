export type NavItem = {
  label: string;
  href: string;
  icon: string;
  /** Phase 2 and 3 features, which SPEC §1.1 ships as locked screens in Phase 1. Labelled
   *  in the nav so nobody clicks through twice wondering why the page looks empty. */
  comingSoon: boolean;
};

/**
 * The single source of truth for the sidebar.
 *
 * Dashboard leads. It used to be Matcher, on the reasoning that Matcher was the only surface
 * that fully worked and burying it under a dashboard of placeholders was a strange thing to
 * do to a user. That reasoning expired: Applications, Resumes and the Dashboard all carry
 * real data now, and the Dashboard is the authenticated home, the page that answers "how is
 * the search going and where should I look next" before the user picks a tool.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard", comingSoon: false },
  { label: "Matcher", href: "/matcher", icon: "Target", comingSoon: false },
  { label: "Applications", href: "/applications", icon: "Briefcase", comingSoon: false },
  { label: "Resumes", href: "/resumes", icon: "FileText", comingSoon: false },
  { label: "Network", href: "/network", icon: "Users", comingSoon: true },
  { label: "Outreach", href: "/outreach", icon: "Mail", comingSoon: true },
] as const;

/**
 * The lower group: utilities rather than workspace.
 *
 * Settings moved out of `NAV_ITEMS` because it is not a place the user works, it is a place
 * they go to change something and leave. Grouping it with Dashboard and Matcher gave it the
 * same weight as the product itself.
 */
export const TOOL_ITEMS: readonly NavItem[] = [
  { label: "Settings", href: "/settings", icon: "Settings", comingSoon: false },
  { label: "Help & Feedback", href: "/settings#help", icon: "Help", comingSoon: false },
] as const;

export function comingSoonHrefs(): string[] {
  return NAV_ITEMS.filter((item) => item.comingSoon).map((item) => item.href);
}
