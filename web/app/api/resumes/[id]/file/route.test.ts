/**
 * The résumé document route: what the preview actually receives.
 *
 * This is the one path in the product where a file leaves Supabase Storage, and it had no
 * test at all. The failures it is written against are the ones the shape of the route makes
 * easy: serving a signed URL for a format no browser renders, letting a DOCX that will not
 * convert return nothing rather than the text already extracted at upload, and — the one
 * that matters most — answering differently for "no such résumé" and "not yours", which
 * turns the 404 into a way to enumerate other people's ids.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserIdOrNull = vi.fn();
vi.mock("@/lib/auth", () => ({ getUserIdOrNull: () => getUserIdOrNull() }));

vi.mock("@/lib/db", () => ({
  isPersistenceConfigured: vi.fn(),
  getResume: vi.fn(),
  getResumeFileBytes: vi.fn(),
  getResumeFileUrl: vi.fn(),
  getDevResumeFile: vi.fn(),
}));

vi.mock("@/lib/extraction/extract", () => ({ docxToHtml: vi.fn() }));

import { GET, POST } from "@/app/api/resumes/[id]/file/route";
import {
  getDevResumeFile,
  getResume,
  getResumeFileBytes,
  getResumeFileUrl,
  isPersistenceConfigured,
} from "@/lib/db";
import { docxToHtml } from "@/lib/extraction/extract";

const ID = "7c1e0a2b-0000-4000-8000-000000000001";

function resume(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    userId: "user_123",
    label: "Data engineer, 2026",
    content: "the text pulled out of the document at upload",
    filePath: `user_123/${ID}.pdf`,
    isDefault: true,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

function fetchDocument(query = "") {
  return GET(new Request(`http://localhost/api/resumes/${ID}/file${query}`), {
    params: Promise.resolve({ id: ID }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserIdOrNull.mockResolvedValue("user_123");
  vi.mocked(isPersistenceConfigured).mockReturnValue(true);
  vi.mocked(getResume).mockResolvedValue(resume() as never);
  vi.mocked(getResumeFileUrl).mockResolvedValue("https://storage.test/signed?token=abc");
  vi.mocked(getDevResumeFile).mockReturnValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/resumes/[id]/file", () => {
  it("401s without a session, before it reads a row", async () => {
    getUserIdOrNull.mockResolvedValue(null);

    expect((await fetchDocument()).status).toBe(401);
    expect(getResume).not.toHaveBeenCalled();
  });

  it("503s when persistence is unconfigured", async () => {
    vi.mocked(isPersistenceConfigured).mockReturnValue(false);

    expect((await fetchDocument()).status).toBe(503);
  });

  it("serves a PDF as a URL, so the bytes do not cross this server twice", async () => {
    const response = await fetchDocument();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      kind: "pdf",
      url: "https://storage.test/signed?token=abc",
    });
    expect(getResumeFileBytes).not.toHaveBeenCalled();
  });

  /** A private bucket means the URL carries a credential, and a shared cache holding one
   *  hands this résumé to the next person through the same proxy. */
  it("never lets a response be cached", async () => {
    const response = await fetchDocument();

    expect(response.headers.get("cache-control")).toBe("no-store, private");
  });

  it("converts a DOCX, which no browser renders", async () => {
    vi.mocked(getResume).mockResolvedValue(resume({ filePath: `user_123/${ID}.docx` }) as never);
    vi.mocked(getResumeFileBytes).mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      extension: "docx",
    });
    vi.mocked(docxToHtml).mockResolvedValue("<p>Converted</p>");

    expect(await (await fetchDocument()).json()).toEqual({
      kind: "docx",
      html: "<p>Converted</p>",
    });
  });

  /** A worse preview than the real structure, and a much better one than nothing. */
  it("falls back to the extracted text when a DOCX will not convert", async () => {
    vi.mocked(getResume).mockResolvedValue(resume({ filePath: `user_123/${ID}.docx` }) as never);
    vi.mocked(getResumeFileBytes).mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      extension: "docx",
    });
    vi.mocked(docxToHtml).mockResolvedValue(null);

    expect(await (await fetchDocument()).json()).toEqual({
      kind: "txt",
      text: "the text pulled out of the document at upload",
    });
  });

  it("decodes a text file rather than pointing the browser at it", async () => {
    vi.mocked(getResume).mockResolvedValue(resume({ filePath: `user_123/${ID}.txt` }) as never);
    vi.mocked(getResumeFileBytes).mockResolvedValue({
      bytes: new TextEncoder().encode("Plain résumé text"),
      extension: "txt",
    });

    expect(await (await fetchDocument()).json()).toEqual({
      kind: "txt",
      text: "Plain résumé text",
    });
  });

  it("treats the extension case-insensitively", async () => {
    vi.mocked(getResume).mockResolvedValue(resume({ filePath: `user_123/${ID}.PDF` }) as never);

    expect(await (await fetchDocument()).json()).toMatchObject({ kind: "pdf" });
  });

  /**
   * The three cases that must be indistinguishable. A different status for "not yours"
   * confirms the id is real, which is how a 404 becomes an enumeration oracle.
   */
  it.each([
    ["no such résumé", null],
    ["a résumé that is not the caller's", null],
    ["a résumé with no file stored", resume({ filePath: null })],
  ])("404s for %s", async (_case, row) => {
    vi.mocked(getResume).mockResolvedValue(row as never);

    const response = await fetchDocument();
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("NOT_FOUND");
  });

  it("404s when the signed URL cannot be minted", async () => {
    vi.mocked(getResumeFileUrl).mockResolvedValue(null);

    expect((await fetchDocument()).status).toBe(404);
  });

  it("scopes every read to the caller, never to a path from the request", async () => {
    await fetchDocument();

    expect(getResume).toHaveBeenCalledWith("user_123", ID);
    expect(getResumeFileUrl).toHaveBeenCalledWith("user_123", ID);
  });

  describe("?raw=1, the dev-mode byte path", () => {
    it("returns the held bytes inline for an owned résumé", async () => {
      vi.mocked(getDevResumeFile).mockReturnValue({
        bytes: new Uint8Array([37, 80, 68, 70]),
        contentType: "application/pdf",
        extension: "pdf",
      });

      const response = await fetchDocument("?raw=1");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(response.headers.get("content-disposition")).toBe('inline; filename="resume.pdf"');
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(
        new Uint8Array([37, 80, 68, 70]),
      );
    });

    /** `getDevResumeFile` returns null outside dev mode, so this branch opens no door in
     *  any other configuration. The ownership check still runs first. */
    it("404s when there is nothing held, and checks ownership before looking", async () => {
      const response = await fetchDocument("?raw=1");

      expect(response.status).toBe(404);
      expect(getResume).toHaveBeenCalledWith("user_123", ID);
    });

    it("does not look for bytes at all when the row is not the caller's", async () => {
      vi.mocked(getResume).mockResolvedValue(null as never);

      expect((await fetchDocument("?raw=1")).status).toBe(404);
      expect(getDevResumeFile).not.toHaveBeenCalled();
    });
  });
});

describe("POST /api/resumes/[id]/file", () => {
  it("405s, because the route exists only to serve the document", async () => {
    const response = await POST();

    expect(response.status).toBe(405);
    expect((await response.json()).error).toBe("METHOD_NOT_ALLOWED");
  });
});
