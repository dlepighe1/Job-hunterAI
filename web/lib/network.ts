/**
 * Network: the user's own applications, rolled up by company, plus the contacts they
 * entered themselves.
 *
 * **What this deliberately is not.** FEATURES.md §6 defers Network on three questions:
 * where company data comes from, what personal data may be stored and under what lawful
 * basis, and how to offer the feature without building a contact scraper. It also excludes
 * scraping, profiling anyone who has not consented, and any employer-side view of
 * candidates, regardless of how those questions are answered.
 *
 * Every one of the blocked questions is about data this app would go and FETCH. None of
 * them arises here, because nothing is fetched: a company exists on this screen because the
 * user applied there, and a person exists because the user typed them in. There is no
 * enrichment, no lookup, no import, and no external source of any kind. The two sketch
 * items §6 lists that need none of the blocked answers are exactly the two implemented.
 *
 * Pure functions over data the caller already has, so the whole thing is testable offline
 * and no part of it can quietly grow a network call.
 */

import { type ApplicationStatus, isTerminal } from "@/lib/applications";
import type { ApplicationView } from "@/lib/use-applications";

/** A person the user entered. Mirrors the `contacts` row; see the schema comment for why
 *  there is no enrichment field here and never will be. */
export interface ContactView {
  id: string;
  userId: string;
  name: string;
  roleTitle: string | null;
  company: string | null;
  email: string | null;
  contactUrl: string | null;
  applicationId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyGroup {
  /** The first spelling the user used. Not normalised, since correcting their capitalisation is
   *  not this feature's job, only recognising that two spellings are one company. */
  name: string;
  applications: ApplicationView[];
  contacts: ContactView[];
  /**
   * The furthest stage any *open* application at this company reached, or null when there
   * are none. A rejection at one posting says nothing about another still open there.
   */
  furthestStatus: ApplicationStatus | null;
  /** True when every application here is closed. Lets the UI mute the card without
   *  pretending the company is still in play. */
  allClosed: boolean;
  lastActivityAt: string;
}

/** Pipeline order. Outcomes are absent: they are not a further stage, they are the end. */
const STAGE_RANK: Partial<Record<ApplicationStatus, number>> = {
  saved: 0,
  applied: 1,
  screening: 2,
  interview: 3,
  offer: 4,
};

/** "Atlas Systems" and "  atlas systems " are one company the user typed twice. */
function key(name: string): string {
  return name.trim().toLowerCase();
}

export function groupByCompany(
  applications: ApplicationView[],
  contacts: ContactView[],
): CompanyGroup[] {
  const groups = new Map<string, CompanyGroup>();

  function ensure(name: string, activity: string): CompanyGroup {
    const id = key(name);
    const existing = groups.get(id);
    if (existing) {
      if (activity > existing.lastActivityAt) existing.lastActivityAt = activity;
      return existing;
    }
    const created: CompanyGroup = {
      name: name.trim(),
      applications: [],
      contacts: [],
      furthestStatus: null,
      allClosed: false,
      lastActivityAt: activity,
    };
    groups.set(id, created);
    return created;
  }

  for (const application of applications) {
    ensure(application.company, application.lastActivityAt).applications.push(application);
  }

  for (const contact of contacts) {
    // A contact with no company has nowhere to sit. Inventing a group for them would put a
    // card on the screen named after nothing.
    if (!contact.company || !contact.company.trim()) continue;
    ensure(contact.company, contact.updatedAt).contacts.push(contact);
  }

  for (const group of groups.values()) {
    const open = group.applications.filter((application) => !isTerminal(application.status));
    group.allClosed = group.applications.length > 0 && open.length === 0;

    // Prefer the furthest OPEN application. Only when everything is closed does a closed
    // status get to speak for the company.
    const considered = open.length > 0 ? open : group.applications;
    group.furthestStatus =
      considered.reduce<ApplicationStatus | null>((furthest, application) => {
        if (!furthest) return application.status;
        const a = STAGE_RANK[application.status] ?? -1;
        const b = STAGE_RANK[furthest] ?? -1;
        return a > b ? application.status : furthest;
      }, null) ?? null;
  }

  return [...groups.values()].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}
