/**
 * veilpointSanitizer.js — replaces the regex blocklist in App.jsx's
 * extractVeilpointPayload with real, DOM-parser-based sanitization.
 *
 * WHY: the original sanitizer stripped `<script>` tags and
 * ` on\w+="[^"]*"` attributes via regex. Both are bypassable —
 *   <svg onload=alert(1)>            (unquoted — no `="` for the regex to match)
 *   <svg onload='alert(1)'>          (single-quoted — regex only matches `="`)
 *   <svg><script>...</script></svg>  (nested/malformed script tags are a
 *                                      known weak spot for script-strip regexes)
 * and the gate logic explicitly *requires* `<svg` to be present to pass a
 * `<style>`-less payload — i.e. it invites through exactly the tag type
 * that supports inline event handlers and can embed <script>.
 *
 * DOMPurify parses with the browser's real HTML parser and inspects actual
 * DOM nodes/attributes rather than matching text patterns, so quoting
 * style and malformed nesting don't create bypasses the way they do for a
 * blocklist regex — same category of fix as swapping home-rolled crypto
 * for a vetted primitive.
 *
 * This file is a drop-in for the *sanitization* half of
 * extractVeilpointPayload. The recursive .srcd-walking logic in App.jsx
 * (recursiveSearch, killWords pre-filter for "is this even a design
 * fragment vs. app source") is unrelated to the XSS surface and doesn't
 * need to change.
 */

import DOMPurify from "dompurify";

const PURIFY_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  FORBID_TAGS: ["script", "foreignObject"], // foreignObject can smuggle arbitrary HTML/JS inside SVG
  FORBID_ATTR: ["onload", "onerror", "onclick", "onmouseover", "onfocus", "onanimationstart"],
};

/** Sanitizes extracted SVG/HTML markup. Never returns script/event-handler content. */
export function sanitizeVeilpointHtml(html) {
  return DOMPurify.sanitize(html, PURIFY_CONFIG);
}

/**
 * Scopes an extracted <style> block's selectors so it can only match
 * elements inside `.${scopeClass}` — prevents a malicious .srcd payload's
 * CSS from targeting anything else in the app (other buttons, the lock
 * control, etc. — CSS injection with unscoped selectors is a real
 * UI-redress vector, not just a cosmetic concern).
 *
 * Uses the real CSSOM (via a detached <style> element) instead of
 * regexing selectors by hand, so @media/nested rules are handled
 * correctly. Must run in a browser context (uses `document`).
 */
export function scopeVeilpointCss(cssText, scopeClass) {
  const probe = document.createElement("style");
  probe.textContent = cssText;
  document.head.appendChild(probe);
  let out = [];
  try {
    const sheet = probe.sheet;
    if (sheet) {
      for (const rule of Array.from(sheet.cssRules)) {
        out.push(scopeRule(rule, scopeClass));
      }
    }
  } catch (e) {
    // If the stylesheet fails to parse at all, drop it rather than risk
    // rendering unscoped CSS.
    out = [];
  } finally {
    document.head.removeChild(probe);
  }
  return out.join("\n");
}

function scopeRule(rule, scopeClass) {
  if (rule.type === CSSRule.STYLE_RULE) {
    const scopedSelector = rule.selectorText
      .split(",")
      .map((s) => `.${scopeClass} ${s.trim()}`)
      .join(", ");
    return `${scopedSelector} { ${rule.style.cssText} }`;
  }
  if (rule.type === CSSRule.MEDIA_RULE) {
    const inner = Array.from(rule.cssRules)
      .map((r) => scopeRule(r, scopeClass))
      .join("\n");
    return `@media ${rule.conditionText} { ${inner} }`;
  }
  // @keyframes/@font-face don't target arbitrary elements by selector, so
  // they can't be used for the redress vector this function defends
  // against — pass through as-is.
  return rule.cssText;
}
