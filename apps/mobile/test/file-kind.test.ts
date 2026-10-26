import assert from "node:assert/strict";
import test from "node:test";
import { fileKind } from "../src/file-kind.ts";

test("HTML files are recognized by MIME type or extension", () => {
  assert.equal(fileKind({ name: "page.html", mimeType: "text/html" }), "html");
  assert.equal(fileKind({ name: "page.htm", mimeType: "application/octet-stream" }), "html");
  assert.equal(fileKind({ name: "saved-page", mimeType: "text/html" }), "html");
});

test("PDF files keep their existing preview path", () => {
  assert.equal(fileKind({ name: "report.pdf", mimeType: "application/pdf" }), "pdf");
  assert.equal(fileKind({ name: "report", mimeType: "application/pdf" }), "pdf");
  assert.equal(fileKind({ name: "REPORT.PDF", mimeType: "" }), "pdf");
});

test("unknown files are not treated as HTML or PDF", () => {
  assert.equal(fileKind({ name: "notes.txt", mimeType: "text/plain" }), "other");
  assert.equal(fileKind({ name: "image", mimeType: "image/png" }), "other");
});
