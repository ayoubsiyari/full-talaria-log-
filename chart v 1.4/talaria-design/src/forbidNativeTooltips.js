/**
 * Forbid native browser tooltips (HTML title=).
 * Moves title → data-tip so the V9 tip layer can show Obsidian tips instead.
 * Opt out with data-allow-native-title on the element.
 */

function stripTitle(el) {
  if (!(el instanceof Element)) return;
  if (el.hasAttribute("data-allow-native-title")) return;
  if (el.tagName === "IFRAME") return;
  const t = el.getAttribute("title");
  if (t == null || t === "") return;
  if (!el.hasAttribute("data-tip") && !el.hasAttribute("data-title")) {
    el.setAttribute("data-tip", t);
  }
  el.removeAttribute("title");
}

function sweep(root) {
  if (!(root instanceof Element) && root !== document) return;
  if (root instanceof Element) stripTitle(root);
  const scope = root instanceof Element ? root : document;
  scope.querySelectorAll?.("[title]").forEach(stripTitle);
}

/**
 * @param {Document} [doc]
 * @returns {() => void} disconnect
 */
export function installForbidNativeTooltips(doc = document) {
  if (typeof doc === "undefined" || !doc?.documentElement) return () => {};
  sweep(doc.documentElement);
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "attributes" && r.attributeName === "title") {
        stripTitle(r.target);
        continue;
      }
      r.addedNodes?.forEach((n) => {
        if (n.nodeType === 1) sweep(n);
      });
    }
  });
  mo.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["title"],
  });
  return () => mo.disconnect();
}
