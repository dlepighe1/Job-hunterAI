/**
 * Turn a generated hero raster into the file that ships.
 *
 * The generator returns a 2048x1152 PNG of two-and-a-half megabytes. The frame renders at
 * roughly 560px wide and the spec budgets 180KB per asset, so every one of them has to be
 * resized and squeezed before it goes anywhere near `public/`. Doing that by hand is how
 * three assets end up at three different sizes and three different qualities.
 *
 * Usage:
 *   node scripts/prepare-hero-assets.mjs <source-dir>
 *
 * Expects <source-dir> to contain applications.png, plates.png and network.png. Writes to
 * public/img/hero/ and prints the resulting sizes so the budget is checked rather than
 * assumed.
 *
 * Prompts and provenance for the sources live in
 * docs/plans/hero-asset-prompts.md.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

/**
 * 2x the render width. The hero frame lost its case and its max-width now scales to
 * `clamp(20rem, 44vw, 46rem)`, up to ~736 CSS px, so 1120 was no longer 2x anything and
 * the laptop went soft on a large display.
 */
const WIDTH = 1600;

/** 16:9, matching both the source raster and the frame's aspect-ratio in globals.css. */
const HEIGHT = 900;

/**
 * Raised from 180KB deliberately, not drifted into.
 *
 * Spec §4.5 set 180KB against a 560px frame. The frame is now half again as wide and the
 * asset carries the hero on its own without a case around it, so the budget was re-set to
 * match rather than the resolution being held down to match the budget. One eagerly loaded
 * image at this size is still a fraction of a typical hero photograph.
 */
const BUDGET = 320 * 1024;

/** Only one asset is still a raster; plates and network are drawn in SVG. */
const ASSETS = ["applications"];

const sourceDir = process.argv[2];
if (!sourceDir) {
  console.error("usage: node scripts/prepare-hero-assets.mjs <source-dir>");
  process.exit(1);
}

const outDir = join(process.cwd(), "public", "img", "hero");
let failed = false;

for (const name of ASSETS) {
  /**
   * Feather the edges to transparent.
   *
   * The hero frame used to be a case with a filled background, which gave the raster a
   * boundary to end at. With the case removed the asset sits directly on the page, and its
   * own near-black ground, close to `--obsidian` but not identical to it, read as a
   * faint rectangle floating in the hero. Fading the outer band to nothing removes the
   * edge rather than trying to colour-match it, which would break the moment either value
   * moved.
   *
   * `dest-in` keeps the source's colour and takes its alpha from the mask, so the blurred
   * white rectangle below becomes the visibility envelope.
   */
  const inset = Math.round(WIDTH * 0.045);
  const mask = Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}">
       <defs><filter id="f" x="-20%" y="-20%" width="140%" height="140%">
         <feGaussianBlur stdDeviation="${Math.round(WIDTH * 0.028)}" />
       </filter></defs>
       <rect x="${inset}" y="${inset}" width="${WIDTH - inset * 2}" height="${HEIGHT - inset * 2}"
             rx="${Math.round(WIDTH * 0.02)}" fill="#fff" filter="url(#f)" />
     </svg>`,
  );

  const source = sharp(readFileSync(join(sourceDir, `${name}.png`)))
    .resize(WIDTH, HEIGHT, { fit: "cover" })
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }]);

  // Both formats are produced and the smaller wins. These are dark, smooth, low-detail
  // renders, exactly the content a palette PNG handles well, but a smooth cyan glow on
  // near-black is also exactly what banding shows up in, so which format wins is a
  // property of the individual image and not worth predicting.
  const png = await source.clone().png({ compressionLevel: 9 }).toBuffer();
  const webp = await source.clone().webp({ quality: 82 }).toBuffer();

  const useWebp = webp.length < png.length;
  const buffer = useWebp ? webp : png;
  const ext = useWebp ? "webp" : "png";
  const target = join(outDir, `${name}.${ext}`);

  writeFileSync(target, buffer);

  const kb = (buffer.length / 1024).toFixed(1);
  const over = buffer.length > BUDGET;
  if (over) failed = true;
  console.log(
    `${name.padEnd(14)} ${ext.padEnd(4)} ${kb.padStart(7)}KB ${over ? "OVER BUDGET" : "ok"}`,
  );
}

if (failed) {
  console.error(`\nAt least one asset exceeds the ${BUDGET / 1024}KB budget.`);
  console.error("Reduce dimensions before reducing quality, see spec §4.5.");
  process.exit(1);
}
