import { describe, expect, it } from "vitest";
import { validImage, replaceImage } from "../lib/report-media";
import { patientReportProjection } from "../lib/patient-reports";
import { queueReportRequest, takeReportRequests } from "../lib/report-request-draft";
describe("multi-modal report content", () => {
  it("accepts five images without an image-count restriction", () => {
    expect(Array.from({ length: 5 }, () => validImage({ type: "image/png", size: 100 })).every(Boolean)).toBe(true);
  });
  it("rejects unsafe image formats", () => { expect(validImage({ type: "image/svg+xml", size: 100 })).toBe(false); });
  it("enforces the approved 10 MiB per-image limit", () => { expect(validImage({ type: "image/jpeg", size: 10485760 })).toBe(true); expect(validImage({ type: "image/jpeg", size: 10485761 })).toBe(false); });
  it("replaces an individual item without overwriting or reordering its siblings", () => { expect(replaceImage(["a","b","c","d","e"], 1, "new")).toEqual(["a","new","c","d","e"]); });
  it("keeps original text, ordered images and legacy audio in the patient projection", () => {
    const images = Array.from({ length: 5 }, (_, position) => ({ id: `${position}`, position, path: `p1/${position}`, mimeType: "image/png", sizeBytes: 100 }));
    const result = patientReportProjection({ id: "TEST", patientId: "p1", submittedBy: "u-pat", createdAt: "2026-11-05T00:00:00Z", pain: 0, symptoms: [], notes: "text", status: "submitted", activity: [], images, audioPath: "p1/audio" });
    expect(result.images).toEqual(images); expect(result.notes).toBe("text"); expect(result.audioPath).toBe("p1/audio");
  });
  it("does not transfer request selections to another identity", () => { queueReportRequest("one", "water"); expect(takeReportRequests("two")).toEqual([]); });
});