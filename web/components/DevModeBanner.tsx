/**
 * The strip that says this is not real.
 *
 * A dev session looks exactly like a signed-in one, which is the point of it, and it is also
 * the risk. Fourteen applications and a populated career profile are convincing, and a
 * screenshot of them is indistinguishable from a screenshot of real usage unless something
 * on screen says otherwise.
 *
 * So the banner is unmissable, fixed, and appears on every authenticated screen. It renders
 * only when `isDevMode()` is true, which is never in production.
 *
 * A server component: the check reads `process.env` and there is nothing interactive here,
 * so there is no reason to ship it to the browser.
 */

import { isDevMode } from "@/lib/dev-mode";

export function DevModeBanner() {
  if (!isDevMode()) return null;

  return (
    <div className="dev-banner" role="status">
      <b>DEV MODE</b>
      <span>
        Sign-in is bypassed and every figure below is fixture data. Nothing is read from or
        written to a database.
      </span>
      <code>DEV_BYPASS_AUTH=1</code>
    </div>
  );
}
