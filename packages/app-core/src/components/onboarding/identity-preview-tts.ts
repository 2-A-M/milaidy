import { PREMADE_VOICES } from "../../voice/types";

const CLOUD_TTS_VOICE_IDS = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "nova",
  "sage",
  "shimmer",
  "verse",
]);

export const DEFAULT_PREVIEW_TTS_MODEL_ID = "eleven_flash_v2_5";

export interface ResolvePreviewTtsEndpointsOptions {
  preferCloudProxy?: boolean;
}

export interface PreviewTtsRequestPlan {
  endpoint: string;
  body: {
    text: string;
    voiceId?: string;
    modelId: string;
    outputFormat: "mp3_44100_128";
  };
}

/** Map an ElevenLabs voice ID to a free Edge TTS voice by gender. */
function resolveEdgeVoiceId(elevenLabsVoiceId: string): string {
  const preset = PREMADE_VOICES.find((v) => v.voiceId === elevenLabsVoiceId);
  return preset?.gender === "male" ? "en-US-GuyNeural" : "en-US-AriaNeural";
}

export function resolvePreviewTtsEndpoints(
  voiceId: string,
  options?: ResolvePreviewTtsEndpointsOptions,
): string[] {
  const normalizedVoiceId = voiceId.trim().toLowerCase();
  if (options?.preferCloudProxy === true) {
    return ["/api/tts/cloud", "/api/tts/elevenlabs", "/api/tts/edge"];
  }
  const isCloudVoice = CLOUD_TTS_VOICE_IDS.has(normalizedVoiceId);
  return isCloudVoice
    ? ["/api/tts/cloud", "/api/tts/elevenlabs", "/api/tts/edge"]
    : ["/api/tts/elevenlabs", "/api/tts/edge"];
}

export function buildPreviewTtsRequestPlans(args: {
  text: string;
  voiceId?: string;
  preferCloudProxy?: boolean;
  modelId?: string;
}): PreviewTtsRequestPlan[] {
  const text = args.text.trim();
  if (!text) {
    return [];
  }
  const voiceId = args.voiceId?.trim();
  const endpoints = resolvePreviewTtsEndpoints(voiceId ?? "", {
    preferCloudProxy: args.preferCloudProxy,
  });
  return endpoints.map((endpoint) => ({
    endpoint,
    body: {
      text,
      ...(voiceId
        ? {
            voiceId:
              endpoint === "/api/tts/edge"
                ? resolveEdgeVoiceId(voiceId)
                : voiceId,
          }
        : {}),
      modelId: args.modelId ?? DEFAULT_PREVIEW_TTS_MODEL_ID,
      outputFormat: "mp3_44100_128",
    },
  }));
}
