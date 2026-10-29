import assert from "node:assert/strict";
import test from "node:test";
import { fileBadge, fileExtension, fileKind, fileMimeType } from "../src/file-kind.ts";

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

test("documents and images are grouped into the supported format filters", () => {
  assert.equal(fileKind({ name: "notes.md", mimeType: "text/plain" }), "markdown");
  assert.equal(fileKind({ name: "chart.png", mimeType: "image/png" }), "image");
  assert.equal(fileKind({ name: "memo.docx", mimeType: "" }), "word");
  assert.equal(fileKind({ name: "model.xlsx", mimeType: "" }), "excel");
  assert.equal(fileKind({ name: "export.csv", mimeType: "text/plain" }), "excel");
  assert.equal(fileKind({ name: "deck.pptx", mimeType: "" }), "ppt");
  assert.equal(fileKind({ name: "notes.txt", mimeType: "text/plain" }), "text");
});

test("unknown files remain safe and do not enter a supported category", () => {
  assert.equal(fileKind({ name: "archive.zip", mimeType: "application/zip" }), "other");
  assert.equal(fileKind({ name: "binary", mimeType: "application/octet-stream" }), "other");
});

test("upload helpers derive canonical MIME types, extensions and badges", () => {
  assert.equal(fileExtension({ name: "REPORT.PDF" }), "pdf");
  assert.equal(fileBadge({ name: "slides.pptx", mimeType: "" }), "PPTX");
  assert.equal(fileMimeType({ name: "brief.markdown", mimeType: "text/plain" }), "text/markdown");
  assert.equal(fileMimeType({ name: "model", mimeType: "application/pdf" }), "application/pdf");
});
