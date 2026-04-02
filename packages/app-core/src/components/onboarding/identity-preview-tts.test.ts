import { describe, expect, it } from "vitest";
import {
  buildPreviewTtsRequestPlans,
  DEFAULT_PREVIEW_TTS_MODEL_ID,
  resolvePreviewTtsEndpoints,
} from "./identity-preview-tts";

describe("resolvePreviewTtsEndpoints", () => {
  it("prefers cloud route first for cloud-native voice IDs", () => {
    expect(resolvePreviewTtsEndpoints("nova")).toEqual([
      "/api/tts/cloud",
      "/api/tts/elevenlabs",
      "/api/tts/edge",
    ]);
    expect(resolvePreviewTtsEndpoints("  SHIMMER  ")).toEqual([
      "/api/tts/cloud",
      "/api/tts/elevenlabs",
      "/api/tts/edge",
    ]);
  });

  it("uses elevenlabs then edge for preset/custom elevenlabs voice IDs", () => {
    expect(resolvePreviewTtsEndpoints("21m00Tcm4TlvDq8ikWAM")).toEqual([
      "/api/tts/elevenlabs",
      "/api/tts/edge",
    ]);
    expect(resolvePreviewTtsEndpoints("cNYrMw9glwJZXR8RwbuR")).toEqual([
      "/api/tts/elevenlabs",
      "/api/tts/edge",
    ]);
  });

  it("can prefer the cloud proxy first for preset voices during onboarding", () => {
    expect(
      resolvePreviewTtsEndpoints("EXAVITQu4vr4xnSDxMaL", {
        preferCloudProxy: true,
      }),
    ).toEqual(["/api/tts/cloud", "/api/tts/elevenlabs", "/api/tts/edge"]);
  });
});

describe("buildPreviewTtsRequestPlans", () => {
  it("builds cloud-first request plans with edge fallback", () => {
    const plans = buildPreviewTtsRequestPlans({
      text: "what's the play?",
      voiceId: "nPczCjzI2devNBz1zQrb",
      preferCloudProxy: true,
    });
    expect(plans).toEqual([
      {
        endpoint: "/api/tts/cloud",
        body: {
          text: "what's the play?",
          voiceId: "nPczCjzI2devNBz1zQrb",
          modelId: DEFAULT_PREVIEW_TTS_MODEL_ID,
          outputFormat: "mp3_44100_128",
        },
      },
      {
        endpoint: "/api/tts/elevenlabs",
        body: {
          text: "what's the play?",
          voiceId: "nPczCjzI2devNBz1zQrb",
          modelId: DEFAULT_PREVIEW_TTS_MODEL_ID,
          outputFormat: "mp3_44100_128",
        },
      },
      {
        endpoint: "/api/tts/edge",
        body: {
          text: "what's the play?",
          voiceId: "en-US-GuyNeural",
          modelId: DEFAULT_PREVIEW_TTS_MODEL_ID,
          outputFormat: "mp3_44100_128",
        },
      },
    ]);
  });

  it("returns no requests for blank preview text", () => {
    expect(
      buildPreviewTtsRequestPlans({
        text: "   ",
        voiceId: "nPczCjzI2devNBz1zQrb",
      }),
    ).toEqual([]);
  });

  it("maps male voice preset to en-US-GuyNeural for edge endpoint", () => {
    // nPczCjzI2devNBz1zQrb = brian (male)
    const plans = buildPreviewTtsRequestPlans({
      text: "hello",
      voiceId: "nPczCjzI2devNBz1zQrb",
      preferCloudProxy: true,
    });
    const edgePlan = plans.find((p) => p.endpoint === "/api/tts/edge");
    expect(edgePlan?.body.voiceId).toBe("en-US-GuyNeural");
  });

  it("maps female voice preset to en-US-AriaNeural for edge endpoint", () => {
    // 21m00Tcm4TlvDq8ikWAM = rachel (female)
    const plans = buildPreviewTtsRequestPlans({
      text: "hello",
      voiceId: "21m00Tcm4TlvDq8ikWAM",
      preferCloudProxy: true,
    });
    const edgePlan = plans.find((p) => p.endpoint === "/api/tts/edge");
    expect(edgePlan?.body.voiceId).toBe("en-US-AriaNeural");
  });

  it("defaults unknown voice ID to en-US-AriaNeural for edge endpoint", () => {
    const plans = buildPreviewTtsRequestPlans({
      text: "hello",
      voiceId: "unknownVoiceId123",
      preferCloudProxy: true,
    });
    const edgePlan = plans.find((p) => p.endpoint === "/api/tts/edge");
    expect(edgePlan?.body.voiceId).toBe("en-US-AriaNeural");
  });

  it("preserves original voiceId for non-edge endpoints", () => {
    const plans = buildPreviewTtsRequestPlans({
      text: "hello",
      voiceId: "nPczCjzI2devNBz1zQrb",
      preferCloudProxy: true,
    });
    const cloudPlan = plans.find((p) => p.endpoint === "/api/tts/cloud");
    const elevenPlan = plans.find((p) => p.endpoint === "/api/tts/elevenlabs");
    expect(cloudPlan?.body.voiceId).toBe("nPczCjzI2devNBz1zQrb");
    expect(elevenPlan?.body.voiceId).toBe("nPczCjzI2devNBz1zQrb");
  });
});
