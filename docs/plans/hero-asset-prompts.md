# Hero asset prompts

> **Only one of these three assets is still a raster.**
>
> The plates and the contact graph are now drawn entirely in SVG by
> `components/hero/PlatesOverlay.tsx` and `NetworkOverlay.tsx`. Both are flat product UI, and
> that is the one thing this pipeline could not produce: asked for empty panels and
> unlabelled dials, the model returned a door intercom and five billiard balls. The
> description fits hardware as readily as it fits software, and no amount of prompt tuning
> fixes a brief that is genuinely ambiguous.
>
> The lesson generalises. **Generate the things that are objects; draw the things that are
> interfaces.** `applications.webp` stays because a laptop in three-quarter view is an
> object. Everything on its screen is drawn over it.
>
> The prompt skeleton below is kept for regenerating that one asset, and because the
> findings under "What the model actually did with these prompts" cost real attempts to
> learn.

The three rasters behind `components/hero/HeroShowcase.tsx`, and the exact prompts that
produced them. Recorded so a regeneration produces a sibling rather than a stranger, since three
assets rotating in one frame have to look like one set, and "generate three images of X"
across three separate sessions reliably does not.

The skeleton below is **fixed**. Only the SUBJECT line changes between assets.

## Why so much of the art is negative space

Everything with a number on it is added later, in SVG, by the overlay components in Task 10.
That is not a stylistic preference: it is the whole reason this pipeline has two halves. The
reference art baked `92`, `+68%` and `100% ATS Compatibility` into pixels, all three of which
are figures the model cannot produce (`FEATURES.md` §2.3, spec §4.4). Text living in the
overlay can be corrected in a diff. Text living in a raster can only be corrected by
regenerating the raster and hoping the rest of it comes back the same.

So the bases are asked for *empty* panels, dials without readings, and cards without labels.
An asset that arrives with convincing text on it is a failed generation, not a bonus.

## The locked skeleton

> Dark UI product illustration, 3D rendered, on a near-black `#08080C` ground.
> Single light source from the top-left, so every surface has a soft highlight on its
> upper-left edge and a deep shadow to its lower-right.
> Electric cyan `#56CCF2` is the primary accent; vivid teal-green `#00F5A0` appears only
> as a secondary accent on a minority of elements. No purple, no magenta, no indigo.
> Matte slate surfaces with soft neumorphic extrusion, so panels look pressed out of the
> ground rather than drawn on top of it. Rounded corners, no hard outlines.
> Generous negative space; the composition floats, centred, with clear margin on all sides.
> SUBJECT
> Constraints: no readable text anywhere, no numbers, no letterforms: any text-like marks
> must be abstract placeholder bars. No logos of real companies. No photographic human
> faces. No reflective ground plane, no floor, no mirror surface. No web-page chrome, no
> browser window, no menu bar. Transparent or near-black background only.
> 16:9, wide, product-marketing quality.

### Subject lines

**Asset 1: `applications.png`**

> SUBJECT: An open laptop seen in three-quarter view, its screen showing an empty dark
> table of blank rows. A large circular magnifier lens hovers over the screen's right side,
> its rim glowing cyan. Three small rounded cards float free in the space around the laptop,
> each blank.

**Asset 2: `plates.png`**

> SUBJECT: Two tall rounded panels facing each other, floating side by side with a gap
> between them, connected by a single horizontal arrow. Each panel holds one large empty
> circular dial near its top and three short horizontal bars below it. The panels are
> identical in construction; the right one glows slightly more warmly than the left.

**Asset 3: `network.png`**

> SUBJECT: One large glowing sphere at the centre, with five smaller spheres arranged
> around it at varying distances, each connected to the centre by a thin curved line. Two
> small blank rounded cards float at the outer edges. The smaller spheres carry simple
> abstract geometric marks (a triangle, a square, a hexagon) and not letters. Figures inside
> the spheres are featureless silhouettes.

## What each subject line is deliberately avoiding

| Reference art did | Prompt says | Why |
|---|---|---|
| `image_2d2eab.png`: a pipeline of named companies with statuses | "empty dark table of blank rows" | Phase 1c is unbuilt; a populated pipeline shows output the product does not have |
| `image_2e1484.png`: dials reading `76` and `92`, `Elevated Score` | "empty circular dial" | `61 → 74` is drawn by `PlatesOverlay`; 92 is above the model's ceiling |
| `image_2e1484.png`: `+68%`, `100% ATS Compatibility` tiles | "three short horizontal bars" | Neither is a figure the model produces |
| `image_2f1211.png`: Stripe, Google, Notion, Microsoft logos | "abstract geometric marks, not letters" | Spec §6 excludes profiling; and they are other people's trademarks |
| `image_2f1211.png`: rendered human faces | "featureless silhouettes" | Spec §6 |
| `image_2f1211.png`: mirrored floor under the graph | "no reflective ground plane" | Spec §4.3 names it explicitly |

The purple in every reference image is also excluded outright. Those were generated before
the Cyber Obsidian palette existed and sit in the periwinkle range this redesign removed.

## Budget

Each asset lands at ≤180KB (spec §4.5), rendered at roughly 560px wide. Reduce dimensions
before reducing quality.

`scripts/prepare-hero-assets.mjs` does this and enforces the budget: it resizes to
1120x630, encodes both PNG and WebP, keeps whichever is smaller, and exits non-zero if
anything is over. Run it against a directory holding `applications.png`, `plates.png` and
`network.png`:

```bash
cd web && node scripts/prepare-hero-assets.mjs <source-dir>
```

**They ship as `.webp`, not `.png`.** WebP won on all three by a wide margin, at 10-18KB
against a 180KB budget, roughly a fifth of the palette-PNG size. The plan named PNG, but
180KB was the constraint that mattered and the format was only ever the means to it. The
repo already served its previous hero asset as WebP.

## What the model actually did with these prompts

Recorded because the next person to regenerate these will hit the same things.

**Negative constraints are largely ignored.** "No reflective ground plane, no floor" left a
mirrored floor under all three of the first attempts, and "no purple, no magenta, no indigo"
produced a purple laptop UI and a purple card. Rewriting them as positive statements of what
*is* there, "floating in an infinite empty black void with nothing underneath it", "the
entire colour scheme is electric cyan blue and charcoal slate grey", fixed both in one pass.
The skeleton above is the rewritten form.

**Ring shapes read as an eye.** An early network attempt drew the five satellites joined by
an ellipse, which reads unmistakably as an eye, a bad accidental symbol for a product whose
hero copy promises "nothing stored for guests". The subject line now rules out a ring, an
orbit and an ellipse by name.

**Counts drift.** "Five smaller spheres" produced eight. Stating "exactly five" and listing
five distinct symbols by name held it.

## Record of generation

| Asset | Model | Generated | Notes |
|---|---|---|---|
| `applications.webp` | `z_image` (Higgsfield) | 2026-08-13 | 2nd attempt. 1st had purple screen chrome and a reflective floor. **The only surviving raster.** |
| ~~`plates.webp`~~ | n/a | n/a | Deleted. Replaced by `PlatesOverlay.tsx`, drawn in SVG. |
| ~~`network.webp`~~ | n/a | n/a | Deleted. Replaced by `NetworkOverlay.tsx`, drawn in SVG. |

Recraft V4.1 was the first choice, since it takes an explicit hex palette, which is worth a lot
here, but it requires a paid Higgsfield plan and returned
`job_minimum_basic_plan_required`. `z_image` needs the palette described in prose instead,
which is why the skeleton names the hex values inline. Total cost: 1.20 credits over eight
generations.

The 2048x1152 sources are not committed, since they are ~2.5MB each and the shipped assets are
derived from them by the script above. Regenerating means re-running the prompts.
