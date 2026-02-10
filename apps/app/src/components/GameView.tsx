/**
 * Game View — embeds a running app's game client in an iframe.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { client } from "../api-client";
import { useApp } from "../AppContext";

const DEFAULT_VIEWER_SANDBOX = "allow-scripts allow-same-origin allow-popups";
const READY_EVENT_BY_AUTH_TYPE: Record<string, string> = {
  HYPERSCAPE_AUTH: "HYPERSCAPE_READY",
};

export function GameView() {
  const {
    activeGameApp,
    activeGameDisplayName,
    activeGameViewerUrl,
    activeGameSandbox,
    activeGamePostMessageAuth,
    activeGamePostMessagePayload,
    setState,
    setActionNotice,
  } = useApp();
  const [stopping, setStopping] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!activeGamePostMessageAuth || !activeGamePostMessagePayload) return;
    const expectedReadyType =
      READY_EVENT_BY_AUTH_TYPE[activeGamePostMessagePayload.type];
    if (!expectedReadyType) return;

    const onMessage = (event: MessageEvent<{ type?: string }>) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow || event.source !== iframeWindow) return;
      if (event.data?.type !== expectedReadyType) return;
      iframeWindow.postMessage(activeGamePostMessagePayload, "*");
      setActionNotice("Viewer auth sent.", "info", 1800);
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [
    activeGamePostMessageAuth,
    activeGamePostMessagePayload,
    setActionNotice,
  ]);

  const handleStop = useCallback(async () => {
    if (!activeGameApp) return;
    setStopping(true);
    try {
      await client.stopApp(activeGameApp);
      setState("activeGameApp", "");
      setState("activeGameDisplayName", "");
      setState("activeGameViewerUrl", "");
      setState("activeGameSandbox", DEFAULT_VIEWER_SANDBOX);
      setState("activeGamePostMessageAuth", false);
      setState("activeGamePostMessagePayload", null);
      setState("tab", "apps");
      setActionNotice("App stopped.", "success");
    } catch (err) {
      setActionNotice(`Failed to stop: ${err instanceof Error ? err.message : "error"}`, "error");
    } finally {
      setStopping(false);
    }
  }, [activeGameApp, setState, setActionNotice]);

  if (!activeGameViewerUrl) {
    return (
      <div className="flex items-center justify-center py-10 text-muted italic">
        No game is currently running.{" "}
        <button
          onClick={() => setState("tab", "apps")}
          className="text-xs px-3 py-1 bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover disabled:opacity-40 ml-2"
        >
          Browse Apps
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card">
        <span className="font-bold text-sm">{activeGameDisplayName || activeGameApp}</span>
        {activeGamePostMessageAuth ? (
          <span className="text-[10px] px-1.5 py-0.5 border border-border text-muted">
            postMessage auth
          </span>
        ) : null}
        <span className="flex-1" />
        <button
          className="text-xs px-3 py-1 bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover disabled:opacity-40"
          onClick={() => window.open(activeGameViewerUrl, "_blank", "noopener,noreferrer")}
        >
          Open in New Tab
        </button>
        <button
          className="text-xs px-3 py-1 bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover disabled:opacity-40"
          disabled={stopping}
          onClick={handleStop}
        >
          {stopping ? "Stopping..." : "Stop"}
        </button>
        <button
          className="text-xs px-3 py-1 bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover disabled:opacity-40"
          onClick={() => setState("tab", "apps")}
        >
          Back to Apps
        </button>
      </div>
      <div className="flex-1 min-h-0 relative">
        <iframe
          ref={iframeRef}
          src={activeGameViewerUrl}
          sandbox={activeGameSandbox}
          className="w-full h-full border-none"
          title={activeGameDisplayName || "Game"}
        />
      </div>
    </div>
  );
}
