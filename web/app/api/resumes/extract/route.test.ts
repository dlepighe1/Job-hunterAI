import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserIdOrNull = vi.fn();
vi.mock("@/lib/auth", () => ({ getUserIdOrNull: () => getUserIdOrNull() }));

const extractTextItems = vi.fn();
const getDocumentProxy = vi.fn();
vi.mock("unpdf", () => ({
  extractTextItems: (...args: unknown[]) => extractTextItems(...args),
  getDocumentProxy: (...args: unknown[]) => getDocumentProxy(...args),
}));

import { POST } from "@/app/api/resumes/extract/route";
import { MAX_UPLOAD_BYTES } from "@/lib/extraction/files";

/** Positioned runs, as `extractTextItems` returns them: one array per page. Laid out as a
 *  real single-column page so the reconstruction has something coherent to rebuild. */
function pageOfLines(lines: string[], startY = 700) {
  return lines.map((str, index) => ({
    str,
    x: 72,
    y: startY - index * 20,
    width: str.length * 5.5,
    height: 11,
    fontSize: 11,
    hasEOL: true,
  }));
}

function upload(file: Blob | null, name = "resume.pdf") {
  const form = new FormData();
  if (file) form.append("file", file, name);
  return POST(new Request("http://localhost/api/resumes/extract", { method: "POST", body: form }));
}

function pdf(bytes = 2048) {
  // A real PDF starts with %PDF-. The route checks the magic number rather than trusting
  // the filename or the browser-supplied content type, both of which the client controls.
  const buffer = new Uint8Array(bytes);
  buffer.set([0x25, 0x50, 0x44, 0x46, 0x2d], 0);
  return new Blob([buffer], { type: "application/pdf" });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserIdOrNull.mockResolvedValue("user_123");
  getDocumentProxy.mockResolvedValue({
    getPage: vi.fn().mockResolvedValue({ view: [0, 0, 612, 792] }),
  });
  extractTextItems.mockResolvedValue({
    totalPages: 2,
    items: [
      pageOfLines([
        "EXPERIENCE",
        ...Array.from({ length: 12 }, () => "experience building python data pipelines at scale"),
      ]),
      pageOfLines([
        "EDUCATION",
        ...Array.from({ length: 12 }, () => "further work on python data pipelines and tooling"),
      ]),
    ],
  });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("POST /api/resumes/extract", () => {
  it("401s without a session, since extraction costs CPU", async () => {
    getUserIdOrNull.mockResolvedValue(null);

    expect((await upload(pdf())).status).toBe(401);
    expect(extractTextItems).not.toHaveBeenCalled();
  });

  it("400s when no file was sent", async () => {
    expect((await upload(null)).status).toBe(400);
    expect(extractTextItems).not.toHaveBeenCalled();
  });

  /**
   * Checks the magic number, not the filename or the content type. Both are supplied by the
   * client and neither says anything about what the bytes are. Handing arbitrary bytes to a
   * PDF parser is how a parser bug becomes a server problem.
   */
  it("refuses a file that is not actually a PDF", async () => {
    const notPdf = new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], {
      type: "application/pdf",
    });

    const response = await upload(notPdf, "resume.pdf");

    expect(response.status).toBe(400);
    expect(extractTextItems).not.toHaveBeenCalled();
  });

  it("refuses a file over the size cap before parsing it", async () => {
    const response = await upload(pdf(MAX_UPLOAD_BYTES + 1));

    expect(response.status).toBe(413);
    expect(extractTextItems).not.toHaveBeenCalled();
  });

  it("returns the extracted text", async () => {
    const response = await upload(pdf());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.content).toContain("python data pipelines");
    expect(body.pages).toBe(2);
  });

  /**
   * A scanned resume is an image of text. `unpdf` returns almost nothing for it, and the
   * honest answer is to say so, because silently storing an empty resume would fail later at the
   * matcher, by which point the cause is invisible.
   */
  it("says the PDF has no extractable text rather than returning an empty string", async () => {
    extractTextItems.mockResolvedValue({ totalPages: 1, items: [[]] });

    const response = await upload(pdf());
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.message).toMatch(/scan|image|text/i);
  });

  it("reports a corrupt PDF as a bad file, not a server error", async () => {
    getDocumentProxy.mockRejectedValue(new Error("Invalid PDF structure"));

    expect((await upload(pdf())).status).toBe(400);
  });

  it("never logs the extracted text", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await upload(pdf());

    for (const call of info.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("python data pipelines");
    }
  });

  /**
   * TXT needs no parser at all, so it must not go anywhere near the PDF path. This also
   * pins the widened format support the redesign added: the drop zone now says "PDF, DOCX,
   * or TXT", and the brief only allows stating limits that are actually enforced.
   */
  it("accepts a plain text résumé without invoking the PDF parser", async () => {
    const body = `EXPERIENCE
${"python data pipelines at scale ".repeat(20)}`;
    const response = await upload(new Blob([body], { type: "text/plain" }), "resume.txt");

    expect(response.status).toBe(200);
    expect((await response.json()).content).toContain("python data pipelines");
    expect(extractTextItems).not.toHaveBeenCalled();
  });

  it("names the legacy Word format rather than failing generically", async () => {
    const doc = new Blob([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])], { type: "application/msword" });
    const response = await upload(doc, "resume.doc");

    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/legacy \.doc/i);
  });

  it("explains that an uploaded image has no text to extract", async () => {
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], {
      type: "image/png",
    });
    const response = await upload(png, "scan.png");

    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/image/i);
  });

  // The gate that replaced "show everyone a correction box just in case": text that parsed
  // but lost every space is reported, so the user is asked to look only when it matters.
  it("reports a degraded extraction as a 200 carrying the reason", async () => {
    extractTextItems.mockResolvedValue({
      totalPages: 1,
      items: [
        pageOfLines(
          Array.from({ length: 60 }, (_, i) => `SeniorBackendEngineerAtlasSystems${i}`),
        ),
      ],
    });

    const response = await upload(pdf());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.quality.verdict).toBe("degraded");
    expect(body.quality.reason).toMatch(/ran together|spacing/i);
  });
});
