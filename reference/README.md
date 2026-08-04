# Superseded prior work

Nothing in this directory is wired into the application. Do not import from it.

These files come from `Resume-jd-matcher` at commit `27162e1`, the peak of the Phase 1 shell
before that repository narrowed to research only. They are kept because they encode working
code and real decisions, and because "we tried that and here is why it changed" is worth more
than a deleted file. They are separated from `web/` because the specification in
`docs/SPEC.md` has since overruled them, and code that looks current but is not is worse than
code that is plainly marked.

| File | Superseded by |
|---|---|
| `legacy-web/app/api/analyze/route.ts` | SPEC Part 4. The API is now one scoring endpoint plus resource routes, not a single analyze verb |
| `legacy-web/app/api/compare/route.ts` | SPEC Part 4 and Part 2.4. Multi-engine comparison is a research-demo concern, not a product one |
| `legacy-web/app/api/extract/route.ts` | SPEC Phase 1d, which schedules PDF extraction with the rest of hardening |
| `legacy-web/app/api/share/[id]/route.ts` | SPEC Part 7. Shareable links must default to private with unguessable ids, which this does not do |
| `legacy-web/lib/db.ts` | SPEC Part 3. The data model changed shape; rebuild rather than adapt |
| `legacy-web/lib/rate-limit.ts` | SPEC Part 7, which specifies per-user limits rather than per-IP |
| `legacy-web/lib/providers/openrouter.ts` | SPEC Part 2.4 engine policy, which drops OpenRouter |
| `legacy-web/lib/providers/index.ts` | The registry it indexes no longer exists in this shape |
| `legacy-web/components/ResultsView.tsx` and friends | SPEC Phase 1a, which ports the result components from the research repository's demo page instead |
| `legacy-web/app/(app)/compare/page.tsx` | The compare flow it belongs to |
| `legacy-web/app/results/[id]/page.tsx` | The share flow it belongs to |

## What is still worth reading here

- **`lib/db.ts`** has the account-deletion cascade and the Storage cleanup, which SPEC Part 7
  still requires. The shape changes; the requirement does not.
- **`api/share/[id]/route.ts`** shows the id-generation approach, which needs replacing but
  documents the problem.
- **`lib/providers/index.ts`** shows how engines were registered and selected, which is the
  structure Part 2.4 replaces rather than removes.

Full history is in `Resume-jd-matcher`, where every one of these files is reachable at
`27162e1` with its original commits and tests.
