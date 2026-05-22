declare module "@elizaos/capacitor-agent" {
  export { Agent } from "../../../eliza/plugins/plugin-native-agent/src/index";
  export type * from "../../../eliza/plugins/plugin-native-agent/src/index";
}

declare module "@elizaos/capacitor-appblocker" {
  export * from "../../../eliza/plugins/plugin-native-appblocker/src/index";
}

declare module "@elizaos/capacitor-camera" {
  export * from "../../../eliza/plugins/plugin-native-camera/src/index";
}

declare module "@elizaos/capacitor-canvas" {
  export * from "../../../eliza/plugins/plugin-native-canvas/src/index";
}

declare module "@elizaos/capacitor-contacts" {
  export * from "../../../eliza/plugins/plugin-native-contacts/src/index";
}

declare module "@elizaos/capacitor-desktop" {
  export { Desktop } from "../../../eliza/plugins/plugin-native-desktop/src/index";
  export type * from "../../../eliza/plugins/plugin-native-desktop/src/index";
}

declare module "@elizaos/capacitor-gateway" {
  export * from "../../../eliza/plugins/plugin-native-gateway/src/index";
}

declare module "@elizaos/capacitor-location" {
  export * from "../../../eliza/plugins/plugin-native-location/src/index";
}

declare module "@elizaos/capacitor-messages" {
  export * from "../../../eliza/plugins/plugin-native-messages/src/index";
}

declare module "@elizaos/capacitor-mobile-signals" {
  export * from "../../../eliza/plugins/plugin-native-mobile-signals/src/index";
}

declare module "@elizaos/capacitor-phone" {
  export * from "../../../eliza/plugins/plugin-native-phone/src/index";
}

declare module "@elizaos/capacitor-screencapture" {
  export * from "../../../eliza/plugins/plugin-native-screencapture/src/index";
}

declare module "@elizaos/capacitor-swabble" {
  export * from "../../../eliza/plugins/plugin-native-swabble/src/index";
}

declare module "@elizaos/capacitor-system" {
  export * from "../../../eliza/plugins/plugin-native-system/src/index";
}

declare module "@elizaos/capacitor-talkmode" {
  export * from "../../../eliza/plugins/plugin-native-talkmode/src/index";
}

declare module "@elizaos/capacitor-websiteblocker" {
  export * from "../../../eliza/plugins/plugin-native-websiteblocker/src/index";
}

declare module "@elizaos/signal-native";
declare module "qrcode";

declare module "three/examples/jsm/libs/meshopt_decoder.module.js" {
  export const MeshoptDecoder: {
    supported: boolean;
    ready: Promise<void>;
    decode(
      target: Uint8Array,
      count: number,
      size: number,
      source: Uint8Array,
      mode?: number,
    ): void;
    decodeGltfBuffer(
      target: Uint8Array,
      count: number,
      size: number,
      source: Uint8Array,
      mode: string,
      filter?: string,
    ): void;
    useWorkers?(count: number): void;
  };
}

declare module "jsdom" {
  export class JSDOM {
    constructor(
      html?: string,
      options?: {
        url?: string;
        pretendToBeVisual?: boolean;
        [key: string]: unknown;
      },
    );
    window: Window & typeof globalThis;
    serialize(): string;
  }
}
