/**
 * Vendored company marks, keyed by normalized company name.
 *
 * **Deliberately empty.** Every application row renders a monogram today, and that is a
 * design decision rather than an unfinished one.
 *
 * The plan was to vendor a subset of Simple Icons into `public/img/logos/`. Measured against
 * a realistic employer list of 169 companies, that set covered 113. The 56 it missed were
 * Microsoft, Amazon, IBM, Oracle, Adobe, Salesforce, Slack, Disney, Mastercard, all four of
 * the Big 4, all three of MBB, and most of pharma and healthcare. It is a developer-tooling
 * icon set, and the sectors that post the most jobs are the ones it covers least.
 *
 * Two-thirds coverage is worse than none here. A table where Stripe and Netflix carry real
 * marks while Amazon and Microsoft fall back to letters has no pattern a reader can perceive,
 * so it reads as broken rather than as restrained. Uniform monograms read as a choice.
 *
 * There is also a rights question. The specific brands absent from that set look like a
 * takedown list, which suggests those owners asked to be removed from exactly this kind of
 * bundle. Sourcing them from somewhere else to get around that is not a thing to do quietly.
 *
 * This file stays because it is the seam. Populating it is the entire change needed to turn
 * marks on, and `resolveCompanyMark` already returns the `local` case for any key present
 * here. The two live routes if that day comes are a favicon service, which trades the user's
 * employer list to a third party for coverage, or per-company upload through the Storage
 * bucket the résumé uploads already use.
 *
 * The four SVGs already in `public/img/logos/` belong to the marketing hero's contact graph
 * and are referenced directly by `components/hero/NetworkOverlay.tsx`. They are intentionally
 * NOT wired in here: four arbitrary brands lighting up in the applications table is the exact
 * inconsistency described above, in miniature.
 */
export const COMPANY_LOGOS: Record<string, string> = {};
