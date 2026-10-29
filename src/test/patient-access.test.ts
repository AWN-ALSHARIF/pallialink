import { describe, expect, it } from "vitest";
import { emptyPersonal } from "@/lib/accessibility";
import { patientFeatures } from "@/lib/patient-access";

describe("patient interface activation", () => {
  it("activates picture communication only when selected", () => {
    expect(patientFeatures({ ...emptyPersonal(), communication_methods: ["pictures"] }).pictures).toBe(true);
    expect(patientFeatures(emptyPersonal()).pictures).toBe(false);
  });
  it("activates voice separately from read-aloud", () => {
    const features = patientFeatures({ ...emptyPersonal(), communication_methods: ["voice"] });
    expect(features.voice).toBe(true); expect(features.tts).toBe(false);
  });
  it("activates read-aloud separately from voice recording", () => {
    const features = patientFeatures({ ...emptyPersonal(), communication_methods: ["tts"] });
    expect(features.tts).toBe(true); expect(features.voice).toBe(false);
  });
  it("applies large and extra-large text without inventing settings", () => {
    expect(patientFeatures({ ...emptyPersonal(), preferences: { text_size: "large" } }).textSize).toBe("large");
    expect(patientFeatures({ ...emptyPersonal(), preferences: { text_size: "extra_large" } }).textSize).toBe("extra_large");
    expect(patientFeatures(emptyPersonal()).textSize).toBe("standard");
  });
  it("activates high contrast independently", () => {
    const features = patientFeatures({ ...emptyPersonal(), preferences: { contrast: "high" } });
    expect(features.highContrast).toBe(true); expect(features.simplified).toBe(false);
  });
  it("activates simplified navigation independently", () => {
    const features = patientFeatures({ ...emptyPersonal(), preferences: { simplified_navigation: true } });
    expect(features.simplified).toBe(true); expect(features.highContrast).toBe(false);
  });
  it("activates reduced motion independently", () => {
    expect(patientFeatures({ ...emptyPersonal(), preferences: { reduced_motion: true } }).reducedMotion).toBe(true);
    expect(patientFeatures(emptyPersonal()).reducedMotion).toBe(false);
  });
  it("combines alternatives without disabling any", () => {
    expect(patientFeatures({ communication_methods: ["pictures", "voice", "tts", "screen_reader"], primary_method: "pictures", preferences: { text_size: "large", contrast: "high", reduced_motion: true, simplified_navigation: true } })).toEqual({ pictures: true, voice: true, tts: true, textSize: "large", highContrast: true, reducedMotion: true, simplified: true });
  });
});