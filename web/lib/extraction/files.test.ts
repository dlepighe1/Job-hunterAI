import { describe, expect, it } from "vitest";

import {
  ACCEPTED_FILE_COPY,
  MAX_UPLOAD_BYTES,
  detectFileKind,
  unsupportedFileMessage,
} from "@/lib/extraction/files";

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);

const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00);

describe("detectFileKind", () => {
  it("identifies a PDF by its magic number, whatever it is called", () => {
    expect(detectFileKind(PDF, "resume.pdf")).toBe("pdf");
    expect(detectFileKind(PDF, "resume.docx")).toBe("pdf");
    expect(detectFileKind(PDF, "")).toBe("pdf");
  });

  /**
   * DOCX is a ZIP, and so are XLSX, PPTX, JAR and every plain archive. The four magic bytes
   * cannot tell them apart, so the extension is the only available discriminator here. It
   * promotes a ZIP to DOCX and nothing else; it can never override the bytes.
   */
  it("identifies a DOCX from the ZIP header plus its extension", () => {
    expect(detectFileKind(ZIP, "resume.docx")).toBe("docx");
    expect(detectFileKind(ZIP, "RESUME.DOCX")).toBe("docx");
  });

  it("refuses other ZIP containers rather than handing them to a Word parser", () => {
    expect(detectFileKind(ZIP, "spreadsheet.xlsx")).toBeNull();
    expect(detectFileKind(ZIP, "archive.zip")).toBeNull();
    expect(detectFileKind(ZIP, "")).toBeNull();
  });

  it("identifies plain text", () => {
    expect(detectFileKind(text("Alex Johnson\nSenior Backend Engineer\n"), "resume.txt")).toBe(
      "txt",
    );
    // Extension-free: text is identified from its bytes like everything else.
    expect(detectFileKind(text("Experience\n- Built things\n"), "")).toBe("txt");
  });

  it("rejects binary that is not one of the three", () => {
    // A PNG header: no NUL in the first bytes, but control characters throughout.
    expect(detectFileKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "x.png")).toBeNull();
  });

  it("rejects anything containing a NUL byte as binary", () => {
    expect(detectFileKind(bytes(0x41, 0x42, 0x00, 0x43), "resume.txt")).toBeNull();
  });

  it("rejects an empty file", () => {
    expect(detectFileKind(new Uint8Array(), "resume.txt")).toBeNull();
  });
});

describe("unsupportedFileMessage", () => {
  // Each of these is a real thing people upload, and a specific message beats a generic one
  // because it tells them what to actually do next.
  it("names the legacy Word format", () => {
    expect(unsupportedFileMessage("resume.doc")).toMatch(/legacy \.doc/i);
  });

  it("names Pages documents", () => {
    expect(unsupportedFileMessage("resume.pages")).toMatch(/Pages/);
  });

  it("explains that an image has no text to extract", () => {
    expect(unsupportedFileMessage("scan.png")).toMatch(/image/i);
    expect(unsupportedFileMessage("scan.jpeg")).toMatch(/image/i);
  });

  it("falls back to naming what is accepted", () => {
    expect(unsupportedFileMessage("mystery.bin")).toContain(ACCEPTED_FILE_COPY);
  });
});

describe("the stated limit", () => {
  // The copy shown in the drop zone and the number the server enforces are one decision,
  // and this is what stops them drifting apart. The brief is explicit that only limits
  // actually enforced may be displayed.
  it("matches the copy the drop zone shows", () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
    expect(ACCEPTED_FILE_COPY).toContain("10MB");
  });

  it("names every format detection accepts, and no others", () => {
    expect(ACCEPTED_FILE_COPY).toContain("PDF");
    expect(ACCEPTED_FILE_COPY).toContain("DOCX");
    expect(ACCEPTED_FILE_COPY).toContain("TXT");
    expect(ACCEPTED_FILE_COPY).not.toMatch(/\bDOC\b(?!X)/);
    expect(ACCEPTED_FILE_COPY).not.toMatch(/RTF|ODT|Pages/i);
  });
});
