import { resolveCompanyMark } from "@/lib/company-marks";

type Size = "sm" | "md" | "lg";

interface CompanyAvatarProps {
  company: string;
  size?: Size;
}

/**
 * The company mark on an application row, card or drawer header.
 *
 * `aria-hidden`, and that is the deliberate call rather than an oversight. The company name
 * is rendered as text immediately beside this in every one of its three placements, so
 * labelling the avatar too would have a screen reader announce the employer twice on every
 * row of a table. It is decoration in the strict sense: it repeats information already
 * present, faster, for people reading with their eyes.
 *
 * `resolveCompanyMark` returns a monogram for every company today (see `lib/company-logos.ts`
 * for why), so the `local` branch is currently unreachable in this product. It stays because
 * it is the seam the decision is reversed through, and because the fallback path has to be
 * written as a first-class case rather than as an error handler: `onError` hiding a broken
 * image is exactly the "broken image placeholder" the specification rules out.
 */
export function CompanyAvatar({ company, size = "md" }: CompanyAvatarProps) {
  const mark = resolveCompanyMark(company);

  return (
    <span className="company-avatar" data-size={size} aria-hidden="true">
      {mark.kind === "local" ? (
        /* eslint-disable-next-line @next/next/no-img-element -- a committed 400-byte SVG
           under /public needs no loader, and next/image would add a request per row. */
        <img src={mark.src} alt="" width={24} height={24} loading="lazy" decoding="async" />
      ) : (
        mark.initial
      )}
    </span>
  );
}
