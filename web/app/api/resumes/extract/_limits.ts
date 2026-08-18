/** FEATURES.md §3.1 names a 5 MB cap on uploads. Enforced before the bytes reach a parser. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** `%PDF-`. Checked against the actual bytes rather than the filename or the content type,
 *  both of which the client supplies and neither of which describes the contents. */
export const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];
