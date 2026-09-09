import { describe, expect, it } from "vitest";

import { sanitizeDocumentHtml } from "@/lib/extraction/extract";

/**
 * The converted-DOCX preview is injected with `dangerouslySetInnerHTML`, so this function is
 * the thing standing between a Word file and script execution in the drawer. Mammoth builds
 * HTML from document structure and escapes text, so it does not pass markup through on its
 * own; these are the vectors that survive that, plus defence against a future style map or
 * mammoth version that emits more than it does today.
 */
describe("sanitizeDocumentHtml", () => {
  it("keeps the document structure a résumé is made of", () => {
    const html =
      "<h1>Alex Johnson</h1><p>Senior <strong>Backend</strong> Engineer</p>" +
      "<ul><li>Built the ingest pipeline</li></ul>" +
      "<table><tr><td>Python</td></tr></table>";
    expect(sanitizeDocumentHtml(html)).toBe(html);
  });

  it("strips script tags and their contents", () => {
    expect(sanitizeDocumentHtml("<p>Hi</p><script>alert(1)</script>")).toBe("<p>Hi</p>");
    expect(sanitizeDocumentHtml("<p>Hi</p><script src='x.js'></script>")).toBe("<p>Hi</p>");
  });

  it("strips the other tags that can execute or load", () => {
    for (const tag of ["style", "iframe", "object", "embed", "link", "meta"]) {
      expect(sanitizeDocumentHtml(`<p>a</p><${tag}>x</${tag}>`)).toBe("<p>a</p>");
    }
  });

  it("removes inline event handlers in every quoting style", () => {
    expect(sanitizeDocumentHtml(`<p onclick="alert(1)">a</p>`)).toBe("<p>a</p>");
    expect(sanitizeDocumentHtml(`<p onclick='alert(1)'>a</p>`)).toBe("<p>a</p>");
    expect(sanitizeDocumentHtml(`<p onmouseover=alert(1)>a</p>`)).toBe("<p>a</p>");
  });

  // A real hyperlink in a Word document carries whatever scheme its author typed.
  it("keeps safe links and disarms the rest, preserving the text", () => {
    expect(sanitizeDocumentHtml('<a href="https://example.com">site</a>')).toContain(
      'href="https://example.com"',
    );
    expect(sanitizeDocumentHtml('<a href="mailto:a@b.com">mail</a>')).toContain("mailto:");

    const nasty = sanitizeDocumentHtml('<a href="javascript:alert(1)">click</a>');
    expect(nasty).not.toContain("javascript:");
    expect(nasty).toContain("click");

    expect(sanitizeDocumentHtml('<a href="data:text/html,<script>">x</a>')).not.toContain("data:");
  });

  /**
   * Dropped rather than rendered. A DOCX embeds images as base64 and this payload travels
   * inside a JSON response, so a CV with a headshot and a logo becomes several megabytes of
   * string on every preview.
   */
  it("drops embedded images", () => {
    expect(sanitizeDocumentHtml('<p>a</p><img src="data:image/png;base64,AAAA">')).toBe("<p>a</p>");
  });

  it("survives empty and malformed input", () => {
    expect(sanitizeDocumentHtml("")).toBe("");
    expect(sanitizeDocumentHtml("<p>unclosed")).toBe("<p>unclosed");
  });
});
