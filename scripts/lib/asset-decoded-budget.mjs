/**
 * ASSET-DECODED-BUDGET-V1 — no served image may exceed a stated decoded-size budget.
 *
 * A decoded bitmap costs `width x height x 4` bytes in the renderer's image cache,
 * independent of how small the file compressed to. That is how a 4720x2234 wordmark that
 * looks like 87 KB in a directory listing became 40.2 MB of RAM, and how 1.67 MB of PNG
 * on disk became 200 MB of bitmap without anyone noticing for three months.
 *
 * File size review cannot catch this class. Pixel dimensions can, so that is what this
 * gate checks, and it is the thing that has to survive the next design handover.
 *
 * The budget is per image. `TARGETS` records the intended maximum edge for each brand
 * asset together with the displayed size that justifies it, so the next person to touch
 * these files can see the reasoning rather than guessing at a number.
 */

/** Hard ceiling for any single served image, in decoded bytes. */
export const DECODED_BUDGET_BYTES = 4 * 1024 * 1024;

/** Trees whose images are served to browsers. */
export const SERVED_IMAGE_ROOTS = Object.freeze([
    'homepage/public',
    'chart v 1.4/chart',
    'chart v 1.4/talaria-design',
]);

/**
 * Paths excluded from the budget, each with the reason it cannot mislead a user.
 * Anything not matched here is in scope; an unparseable image in scope is a failure,
 * not a skip, so a format this gate cannot read can never slip past it.
 */
export const OUT_OF_SCOPE = Object.freeze([
    {
        pattern: /\/harness\/docs\//,
        reason: 'developer evidence screenshots under a test harness; never referenced by product code or served as art',
    },
    {
        pattern: /\/node_modules\//,
        reason: 'third-party trees are not ours to re-export',
    },
]);

/**
 * Intended maximum edge per brand asset, with the displayed size that sets it.
 *
 * The rule is the Director's: max displayed size at 2x device pixel ratio. Where a
 * single file is used at several sizes the largest one wins. Two assets carry deliberate
 * headroom above 2x and say so, because they are brand-critical surfaces where softness
 * is more expensive than a tenth of a megabyte.
 */
export const TARGETS = Object.freeze([
    {
        basename: 'logo-04.png',
        maxEdge: 880,
        displayed: '440px loader brand (.loader-brand) and a 416px homepage hero (lg:w-[26rem])',
        rationale: '440 x 2 = 880. Also covers the 280px maintenance page, 80px auth panel and 40px header.',
    },
    {
        basename: 'logo-05.png',
        maxEdge: 600,
        displayed: '300px screenshot wordmark (.logo-bottom hover max-width) captured at scale 2',
        rationale: '300 x 2 = 600 device pixels, which is the largest it is ever drawn.',
    },
    {
        basename: 'logo-14.png',
        maxEdge: 600,
        displayed: 'dark-brand twin of logo-05, same 300px wordmark slot at scale 2',
        rationale: 'kept identical to logo-05 so light and dark screenshots match.',
    },
    {
        basename: 'logo-06.png',
        maxEdge: 600,
        displayed: 'no load path found anywhere in any served tree',
        rationale: 'unreferenced wordmark, sized with its siblings rather than left at 4720px for the next person to wire up.',
    },
    {
        basename: 'logo-08.png',
        maxEdge: 256,
        displayed: '80px auth panel (h-20 w-20); 48px notification icon; 38px screenshot brand row at scale 2; 28px backtest bar',
        rationale: '80 x 2 = 160 would satisfy the rule; 256 buys 3x headroom on the login screen for 0.15 MB, which is worth it.',
    },
    {
        basename: 'logo-09.png',
        maxEdge: 256,
        displayed: 'dark-brand twin of logo-08, same slots',
        rationale: 'kept identical to logo-08 so light and dark render alike.',
    },
    {
        basename: 'LOGO-07.png',
        maxEdge: 256,
        displayed: '22px icon in the backtest session modal, plus v8b/v16 design bundles',
        rationale: 'the design-bundle draw sizes are not pinned down, so this keeps 11x the known use.',
    },
    {
        basename: 'talaria-log.logo.png',
        maxEdge: 1200,
        displayed: '1200x630 OpenGraph share card (crawler metadata; never rendered in the app)',
        rationale: '1200x630 is the OpenGraph convention; it is a 1.1 MB download that no page needs at 1730px.',
    },
    {
        basename: 'talaria chart.png',
        maxEdge: 1200,
        displayed: 'no load path found; a marketing-sized chart capture',
        rationale: 'unreferenced, so sizing it cannot regress a rendered surface, and it stops being 733 KB of dead download.',
    },
]);

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;

/** @returns {boolean} whether this path is a raster image the budget applies to. */
export function isBudgetedImage(relativePath) {
    if (!IMAGE_EXT.test(relativePath)) return false;
    const normalised = String(relativePath).replace(/\\/g, '/');
    return !OUT_OF_SCOPE.some((rule) => rule.pattern.test(`/${normalised}/`.replace(/\/+/g, '/')));
}

export function decodedBytes(width, height) {
    return width * height * 4;
}

/** @returns {{maxEdge:number}|null} the recorded target for a basename, if any. */
export function targetFor(basename) {
    return TARGETS.find((t) => t.basename.toLowerCase() === String(basename).toLowerCase()) ?? null;
}

/**
 * Audit a set of already-measured images.
 *
 * @param {Array<{path:string,basename:string,width:number|null,height:number|null}>} images
 */
export function auditImages(images) {
    const overBudget = [];
    const unmeasurable = [];
    const overTarget = [];
    let totalDecoded = 0;

    for (const image of images) {
        if (!isBudgetedImage(image.path)) continue;
        if (!image.width || !image.height) {
            // Fail closed: an image this gate cannot measure is an image it cannot police.
            unmeasurable.push({ path: image.path });
            continue;
        }
        const bytes = decodedBytes(image.width, image.height);
        totalDecoded += bytes;
        if (bytes > DECODED_BUDGET_BYTES) {
            overBudget.push({
                path: image.path,
                pixels: `${image.width}x${image.height}`,
                decodedBytes: bytes,
                decodedMB: +(bytes / 1048576).toFixed(2),
            });
        }
        const target = targetFor(image.basename);
        if (target && Math.max(image.width, image.height) > target.maxEdge) {
            overTarget.push({
                path: image.path,
                pixels: `${image.width}x${image.height}`,
                maxEdge: target.maxEdge,
                displayed: target.displayed,
            });
        }
    }

    return {
        gate: 'ASSET-DECODED-BUDGET-V1',
        budgetBytes: DECODED_BUDGET_BYTES,
        checked: images.filter((i) => isBudgetedImage(i.path)).length,
        totalDecodedBytes: totalDecoded,
        overBudget,
        overTarget,
        unmeasurable,
        pass: overBudget.length === 0 && overTarget.length === 0 && unmeasurable.length === 0,
    };
}
