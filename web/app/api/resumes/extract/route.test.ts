import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserIdOrNull = vi.fn();
vi.mock("@/lib/auth", () => ({ getUserIdOrNull: () => getUserIdOrNull() }));

const extractText = vi.fn();
const getDocumentProxy = vi.fn();
vi.mock("unpdf", () => ({
  extractText: (...args: unknown[]) => extractText(...args),
  getDocumentProxy: (...args: unknown[]) => getDocumentProxy(...args),
}));

import { POST } from "@/app/api/resumes/extract/route";
import { MAX_UPLOAD_BYTES } from "@/app/api/resumes/extract/_limits";

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
  getDocumentProxy.mockResolvedValue({});
  extractText.mockResolvedValue({
    totalPages: 2,
    text: "experience building python data pipelines ".repeat(20),
  });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("POST /api/resumes/extract", () => {
  it("401s without a session, since extraction costs CPU", async () => {
    getUserIdOrNull.mockResolvedValue(null);

    expect((await upload(pdf())).status).toBe(401);
    expect(extractText).not.toHaveBeenCalled();
  });

  it("400s when no file was sent", async () => {
    expect((await upload(null)).status).toBe(400);
    expect(extractText).not.toHaveBeenCalled();
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
    expect(extractText).not.toHaveBeenCalled();
  });

  it("refuses a file over the size cap before parsing it", async () => {
    const response = await upload(pdf(MAX_UPLOAD_BYTES + 1));

    expect(response.status).toBe(413);
    expect(extractText).not.toHaveBeenCalled();
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
    extractText.mockResolvedValue({ totalPages: 1, text: "   " });

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
});
