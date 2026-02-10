/**
 * Character view — agent identity, personality, and avatar.
 *
 * Features:
 *   - Archetype quick-apply with active indicator
 *   - "Custom" state when any field is manually edited
 *   - Import/export character as JSON
 *   - Unsaved changes indicator
 *   - Adjectives and topics editors
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useApp } from "../AppContext";
import { client } from "../api-client";
import { AvatarSelector } from "./AvatarSelector";

interface ArchetypeOption {
  id: string;
  name: string;
  tagline: string;
}

export function CharacterView() {
  const {
    characterData,
    characterDraft,
    characterLoading,
    characterSaving,
    characterSaveSuccess,
    characterSaveError,
    handleCharacterFieldInput,
    handleCharacterArrayInput,
    handleCharacterStyleInput,
    handleSaveCharacter,
    loadCharacter,
    setState,
    selectedVrmIndex,
  } = useApp();

  useEffect(() => {
    void loadCharacter();
  }, [loadCharacter]);

  /* ── Archetypes ─────────────────────────────────────────────────── */
  const [archetypes, setArchetypes] = useState<ArchetypeOption[]>([]);
  const [activeArchetype, setActiveArchetype] = useState<string>("custom");
  const [loadingArchetype, setLoadingArchetype] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/archetypes")
      .then((r) => r.json())
      .then((data) => {
        if (data.archetypes) setArchetypes(data.archetypes);
      })
      .catch(() => {});
  }, []);

  const [selectedSouls, setSelectedSouls] = useState<string[]>([]);
  const [blending, setBlending] = useState(false);
  const [blendError, setBlendError] = useState("");

  const applyCharacterData = useCallback((c: any) => {
    if (c.bio) handleCharacterFieldInput("bio", Array.isArray(c.bio) ? c.bio.join("\n") : c.bio);
    if (c.system) handleCharacterFieldInput("system", c.system);
    if (c.adjectives) handleCharacterFieldInput("adjectives" as any, c.adjectives);
    if (c.topics) handleCharacterFieldInput("topics" as any, c.topics);
    if (c.style) {
      if (c.style.all) handleCharacterStyleInput("all", Array.isArray(c.style.all) ? c.style.all.join("\n") : c.style.all);
      if (c.style.chat) handleCharacterStyleInput("chat", Array.isArray(c.style.chat) ? c.style.chat.join("\n") : c.style.chat);
      if (c.style.post) handleCharacterStyleInput("post", Array.isArray(c.style.post) ? c.style.post.join("\n") : c.style.post);
    }
    if (c.messageExamples) {
      const formatted = c.messageExamples.map((convo: any[]) => ({
        examples: convo.map((msg: any) => ({ name: msg.user, content: { text: msg.content?.text ?? "" } })),
      }));
      handleCharacterFieldInput("messageExamples" as any, formatted);
    }
  }, [handleCharacterFieldInput, handleCharacterStyleInput]);

  const toggleSoul = useCallback((id: string) => {
    setBlendError("");
    setSelectedSouls((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  }, []);

  const applyArchetype = useCallback(async (id: string) => {
    if (id === "custom") {
      setActiveArchetype("custom");
      setSelectedSouls([]);
      return;
    }
    setLoadingArchetype(id);
    setSelectedSouls([id]);
    try {
      const res = await fetch(`/api/archetypes/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.character) {
        applyCharacterData(data.character);
        setActiveArchetype(id);
      }
    } catch { /* ignore */ }
    setLoadingArchetype(null);
  }, [applyCharacterData]);

  const handleBlend = useCallback(async () => {
    if (selectedSouls.length < 2) return;
    setBlending(true);
    setBlendError("");
    try {
      const res = await fetch("/api/archetypes/blend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedSouls, name: characterDraft.name || "{{name}}" }),
      });
      if (!res.ok) throw new Error("blend failed");
      const data = await res.json();
      if (data.character) {
        applyCharacterData(data.character);
        setActiveArchetype("blended");
      } else {
        setBlendError("blend returned unexpected format");
      }
    } catch {
      setBlendError("failed to blend. make sure your LLM provider is set up.");
    }
    setBlending(false);
  }, [selectedSouls, characterDraft.name, applyCharacterData]);

  const handleRandomize = useCallback(async () => {
    setBlending(true);
    setBlendError("");
    const nonCustom = archetypes.filter((a) => a.id !== "custom");
    const shuffled = [...nonCustom].sort(() => Math.random() - 0.5);
    const count = Math.random() > 0.5 ? 3 : 2;
    const picked = shuffled.slice(0, count);
    setSelectedSouls(picked.map((a) => a.id));
    try {
      const res = await fetch("/api/archetypes/blend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: picked.map((a) => a.id), name: characterDraft.name || "{{name}}" }),
      });
      if (!res.ok) throw new Error("random blend failed");
      const data = await res.json();
      if (data.character) {
        applyCharacterData(data.character);
        setActiveArchetype("blended");
      } else {
        setBlendError("random generation failed");
      }
    } catch {
      setBlendError("failed to generate. make sure your LLM provider is set up.");
    }
    setBlending(false);
  }, [archetypes, characterDraft.name, applyCharacterData]);

  // Any manual edit switches to "custom"
  const handleFieldEdit = useCallback((field: string, value: any) => {
    setActiveArchetype("custom");
    handleCharacterFieldInput(field as any, value);
  }, [handleCharacterFieldInput]);

  const handleStyleEdit = useCallback((key: string, value: string) => {
    setActiveArchetype("custom");
    handleCharacterStyleInput(key, value);
  }, [handleCharacterStyleInput]);

  /* ── Import / Export ────────────────────────────────────────────── */
  const handleExport = useCallback(() => {
    const d = characterDraft;
    const exportData = {
      name: d.name ?? "",
      bio: typeof d.bio === "string" ? d.bio.split("\n").filter(Boolean) : (d.bio ?? []),
      system: d.system ?? "",
      style: {
        all: d.style?.all ?? [],
        chat: d.style?.chat ?? [],
        post: d.style?.post ?? [],
      },
      adjectives: d.adjectives ?? [],
      topics: d.topics ?? [],
      messageExamples: (d.messageExamples ?? []).map((convo: any) =>
        (convo.examples ?? []).map((msg: any) => ({
          user: msg.name,
          content: { text: msg.content?.text ?? "" },
        }))
      ),
      postExamples: d.postExamples ?? [],
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(d.name ?? "character").toLowerCase().replace(/\s+/g, "-")}.character.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [characterDraft]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data.name) handleCharacterFieldInput("name", data.name);
        if (data.bio) handleCharacterFieldInput("bio",
          Array.isArray(data.bio) ? data.bio.join("\n") : data.bio);
        if (data.system) handleCharacterFieldInput("system", data.system);
        if (data.adjectives) handleCharacterFieldInput("adjectives" as any, data.adjectives);
        if (data.topics) handleCharacterFieldInput("topics" as any, data.topics);
        if (data.style) {
          if (data.style.all) handleCharacterStyleInput("all",
            Array.isArray(data.style.all) ? data.style.all.join("\n") : data.style.all);
          if (data.style.chat) handleCharacterStyleInput("chat",
            Array.isArray(data.style.chat) ? data.style.chat.join("\n") : data.style.chat);
          if (data.style.post) handleCharacterStyleInput("post",
            Array.isArray(data.style.post) ? data.style.post.join("\n") : data.style.post);
        }
        if (data.messageExamples) {
          const formatted = data.messageExamples.map((convo: any[]) => ({
            examples: convo.map((msg: any) => ({
              name: msg.user ?? msg.name ?? "{{user1}}",
              content: { text: msg.content?.text ?? msg.text ?? "" },
            })),
          }));
          handleCharacterFieldInput("messageExamples" as any, formatted);
        }
        if (data.postExamples) handleCharacterFieldInput("postExamples" as any, data.postExamples);
        setActiveArchetype("custom");
      } catch {
        alert("invalid json file");
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-imported
    e.target.value = "";
  }, [handleCharacterFieldInput, handleCharacterStyleInput]);

  /* ── Character generation state ─────────────────────────────────── */
  const [generating, setGenerating] = useState<string | null>(null);

  const d = characterDraft;
  const bioText = typeof d.bio === "string" ? d.bio : Array.isArray(d.bio) ? d.bio.join("\n") : "";
  const styleAllText = (d.style?.all ?? []).join("\n");
  const styleChatText = (d.style?.chat ?? []).join("\n");
  const stylePostText = (d.style?.post ?? []).join("\n");
  const adjectivesText = (d.adjectives ?? []).join(", ");
  const topicsText = (d.topics ?? []).join(", ");

  const getCharContext = useCallback(() => ({
    name: d.name ?? "",
    system: d.system ?? "",
    bio: bioText,
    style: d.style ?? { all: [], chat: [], post: [] },
    postExamples: d.postExamples ?? [],
  }), [d, bioText]);

  const handleGenerate = useCallback(async (field: string, mode: "append" | "replace" = "replace") => {
    setGenerating(field);
    try {
      const { generated } = await client.generateCharacterField(field, getCharContext(), mode);
      if (field === "bio") {
        handleFieldEdit("bio", generated.trim());
      } else if (field === "style") {
        try {
          const parsed = JSON.parse(generated);
          if (mode === "append") {
            handleStyleEdit("all", [...(d.style?.all ?? []), ...(parsed.all ?? [])].join("\n"));
            handleStyleEdit("chat", [...(d.style?.chat ?? []), ...(parsed.chat ?? [])].join("\n"));
            handleStyleEdit("post", [...(d.style?.post ?? []), ...(parsed.post ?? [])].join("\n"));
          } else {
            if (parsed.all) handleStyleEdit("all", parsed.all.join("\n"));
            if (parsed.chat) handleStyleEdit("chat", parsed.chat.join("\n"));
            if (parsed.post) handleStyleEdit("post", parsed.post.join("\n"));
          }
        } catch { /* raw text fallback */ }
      } else if (field === "chatExamples") {
        try {
          const parsed = JSON.parse(generated);
          if (Array.isArray(parsed)) {
            const formatted = parsed.map((convo: Array<{ user: string; content: { text: string } }>) => ({
              examples: convo.map((msg) => ({ name: msg.user, content: { text: msg.content.text } })),
            }));
            handleFieldEdit("messageExamples", formatted);
          }
        } catch { /* raw text fallback */ }
      } else if (field === "postExamples") {
        try {
          const parsed = JSON.parse(generated);
          if (Array.isArray(parsed)) {
            if (mode === "append") {
              handleCharacterArrayInput("postExamples", [...(d.postExamples ?? []), ...parsed].join("\n"));
            } else {
              handleCharacterArrayInput("postExamples", parsed.join("\n"));
            }
            setActiveArchetype("custom");
          }
        } catch { /* raw text fallback */ }
      }
    } catch { /* generation failed */ }
    setGenerating(null);
  }, [getCharContext, d, handleFieldEdit, handleStyleEdit, handleCharacterArrayInput]);

  const handleRandomName = useCallback(async () => {
    try {
      const { name } = await client.getRandomName();
      handleFieldEdit("name", name);
    } catch { /* ignore */ }
  }, [handleFieldEdit]);

  /* ── Helpers ────────────────────────────────────────────────────── */
  const hasUnsavedChanges = characterData && d.name !== undefined;

  const inputCls = "px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none";
  const textareaCls = `${inputCls} font-inherit resize-y leading-relaxed`;
  const labelCls = "font-semibold text-xs";
  const hintCls = "text-[11px] text-[var(--muted)]";
  const tinyBtnCls = "text-[10px] px-1.5 py-0.5 border border-[var(--border)] bg-[var(--card)] cursor-pointer hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40";

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold">Character</h2>
          <p className="text-[13px] text-[var(--muted)]">soul, identity, and appearance.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
          <button
            className={tinyBtnCls}
            onClick={() => fileInputRef.current?.click()}
            title="import character.json"
            type="button"
          >
            import
          </button>
          <button
            className={tinyBtnCls}
            onClick={handleExport}
            title="export as character.json"
            type="button"
          >
            export
          </button>
        </div>
      </div>

      {/* ═══ ARCHETYPE SELECTOR ═══ */}
      {archetypes.length > 0 && (
        <div className="p-4 border border-[var(--border)] bg-[var(--card)]">
          <div className="font-bold text-sm mb-1">Archetype</div>
          <div className={hintCls + " mb-3"}>
            pick one to apply, or select multiple and blend. editing fields below switches to custom.
          </div>
          <div className="flex flex-wrap gap-1.5">
            {archetypes.filter((a) => a.id !== "custom").map((arch) => {
              const isSelected = selectedSouls.includes(arch.id);
              return (
                <button
                  key={arch.id}
                  className={`text-left px-3 py-2 border cursor-pointer transition-all ${
                    isSelected
                      ? "border-accent !bg-accent !text-accent-fg"
                      : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"
                  } disabled:opacity-40`}
                  onClick={() => {
                    toggleSoul(arch.id);
                    // Single click = apply directly
                    if (!isSelected && selectedSouls.length === 0) {
                      void applyArchetype(arch.id);
                    }
                  }}
                  disabled={loadingArchetype !== null || blending}
                  type="button"
                >
                  <div className="font-bold text-[11px] tracking-wide uppercase">
                    {loadingArchetype === arch.id ? "applying..." : arch.name}
                  </div>
                </button>
              );
            })}
            <div
              className={`px-3 py-2 border ${
                activeArchetype === "custom"
                  ? "border-accent !bg-accent !text-accent-fg"
                  : "border-[var(--border)] bg-[var(--card)]"
              }`}
            >
              <div className="font-bold text-[11px] tracking-wide uppercase">custom</div>
            </div>
          </div>

          {/* Blend + Dice buttons */}
          <div className="flex gap-2 mt-2">
            {selectedSouls.length >= 2 && (
              <button
                className={`${tinyBtnCls} flex items-center gap-1.5`}
                onClick={() => void handleBlend()}
                disabled={blending}
                type="button"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v10m0 0l-4-4m4 4l4-4" /><path d="M5 16c0 2.2 3.1 4 7 4s7-1.8 7-4" /><path d="M5 12c0 2.2 3.1 4 7 4s7-1.8 7-4" /></svg>
                {blending ? "blending..." : "blend selected"}
              </button>
            )}
            <button
              className={`${tinyBtnCls} flex items-center gap-1.5`}
              onClick={() => void handleRandomize()}
              disabled={blending}
              type="button"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.5" /><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" /><circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none" /><circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none" /><circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /></svg>
              {blending ? "generating..." : "random"}
            </button>
          </div>

          {blendError && (
            <div className="text-xs text-[var(--danger,#e74c3c)] mt-2">{blendError}</div>
          )}
          {activeArchetype === "blended" && (
            <div className={hintCls + " mt-2"}>
              blended from {selectedSouls.map((id) => archetypes.find((a) => a.id === id)?.name).filter(Boolean).join(" + ")}
            </div>
          )}
        </div>
      )}

      {/* ═══ SOUL & IDENTITY ═══ */}
      <div className="mt-4 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="flex justify-between items-center mb-4">
          <div>
            <div className="font-bold text-sm">Soul & Identity</div>
            <div className={hintCls}>
              who your agent is and how they think.
            </div>
          </div>
          <button
            className={tinyBtnCls}
            onClick={() => void loadCharacter()}
            disabled={characterLoading}
          >
            {characterLoading ? "loading..." : "reload"}
          </button>
        </div>

        {characterLoading && !characterData ? (
          <div className="text-center py-6 text-[var(--muted)] text-[13px]">
            loading character data...
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Name */}
            <div className="flex flex-col gap-1">
              <label className={labelCls}>name</label>
              <div className="flex items-center gap-2 max-w-[280px]">
                <input
                  type="text"
                  value={d.name ?? ""}
                  maxLength={50}
                  placeholder="agent name"
                  onChange={(e) => handleFieldEdit("name", e.target.value)}
                  className={inputCls + " flex-1 text-[13px]"}
                />
                <button
                  className={tinyBtnCls}
                  onClick={() => void handleRandomName()}
                  title="random name"
                  type="button"
                >
                  random
                </button>
              </div>
            </div>

            {/* Identity (bio) */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <label className={labelCls}>identity</label>
                <button
                  className={tinyBtnCls}
                  onClick={() => void handleGenerate("bio")}
                  disabled={generating === "bio"}
                  type="button"
                >
                  {generating === "bio" ? "generating..." : "generate"}
                </button>
              </div>
              <div className={hintCls}>who your agent is. one line per trait.</div>
              <textarea
                value={bioText}
                rows={4}
                placeholder="describe who your agent is. personality, background, how they see the world."
                onChange={(e) => handleFieldEdit("bio", e.target.value)}
                className={textareaCls}
              />
            </div>

            {/* Soul (system prompt) */}
            <div className="flex flex-col gap-1">
              <label className={labelCls}>soul</label>
              <div className={hintCls}>how your agent thinks and behaves. their core essence.</div>
              <textarea
                value={d.system ?? ""}
                rows={8}
                maxLength={10000}
                placeholder="write in first person. this is who they are, not instructions about them."
                onChange={(e) => handleFieldEdit("system", e.target.value)}
                className={textareaCls + " font-[var(--mono)]"}
              />
            </div>

            {/* Adjectives */}
            <div className="flex flex-col gap-1">
              <label className={labelCls}>adjectives</label>
              <div className={hintCls}>personality traits, comma-separated.</div>
              <input
                type="text"
                value={adjectivesText}
                placeholder="cryptic, insightful, poetic, patient"
                onChange={(e) => {
                  const arr = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                  handleFieldEdit("adjectives", arr);
                }}
                className={inputCls}
              />
            </div>

            {/* Topics */}
            <div className="flex flex-col gap-1">
              <label className={labelCls}>topics</label>
              <div className={hintCls}>what they talk about, comma-separated.</div>
              <input
                type="text"
                value={topicsText}
                placeholder="philosophy, internet culture, pattern recognition"
                onChange={(e) => {
                  const arr = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                  handleFieldEdit("topics", arr);
                }}
                className={inputCls}
              />
            </div>

            {/* Style */}
            <details className="group">
              <summary className="flex items-center gap-1.5 cursor-pointer select-none text-xs font-semibold list-none [&::-webkit-details-marker]:hidden">
                <span className="inline-block transition-transform group-open:rotate-90">&#9654;</span>
                style rules
                <span className="font-normal text-[var(--muted)]">— communication guidelines</span>
                <button
                  className={tinyBtnCls + " ml-auto"}
                  onClick={(e) => { e.preventDefault(); void handleGenerate("style", "replace"); }}
                  disabled={generating === "style"}
                  type="button"
                >
                  {generating === "style" ? "generating..." : "generate"}
                </button>
              </summary>
              <div className="grid grid-cols-3 gap-3 mt-3 p-3 border border-[var(--border)] bg-[var(--bg-muted)]">
                {(["all", "chat", "post"] as const).map((key) => {
                  const val = key === "all" ? styleAllText : key === "chat" ? styleChatText : stylePostText;
                  return (
                    <div key={key} className="flex flex-col gap-1">
                      <label className="font-semibold text-[11px] text-[var(--muted)]">{key}</label>
                      <textarea
                        value={val}
                        rows={4}
                        placeholder={`${key} style rules, one per line`}
                        onChange={(e) => handleStyleEdit(key, e.target.value)}
                        className={textareaCls}
                      />
                    </div>
                  );
                })}
              </div>
            </details>

            {/* Chat Examples */}
            <details className="group">
              <summary className="flex items-center gap-1.5 cursor-pointer select-none text-xs font-semibold list-none [&::-webkit-details-marker]:hidden">
                <span className="inline-block transition-transform group-open:rotate-90">&#9654;</span>
                chat examples
                <span className="font-normal text-[var(--muted)]">— how the agent responds</span>
                <button
                  className={tinyBtnCls + " ml-auto"}
                  onClick={(e) => { e.preventDefault(); void handleGenerate("chatExamples", "replace"); }}
                  disabled={generating === "chatExamples"}
                  type="button"
                >
                  {generating === "chatExamples" ? "generating..." : "generate"}
                </button>
              </summary>
              <div className="flex flex-col gap-2 mt-3">
                {(d.messageExamples ?? []).map((convo, ci) => (
                  <div key={ci} className="p-2.5 border border-[var(--border)] bg-[var(--bg-muted)]">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-[var(--muted)] font-semibold">conversation {ci + 1}</span>
                      <button
                        className="text-[10px] text-[var(--muted)] hover:text-[var(--danger,#e74c3c)] cursor-pointer"
                        onClick={() => {
                          const updated = [...(d.messageExamples ?? [])];
                          updated.splice(ci, 1);
                          handleFieldEdit("messageExamples", updated);
                        }}
                        type="button"
                      >
                        remove
                      </button>
                    </div>
                    {convo.examples.map((msg: any, mi: number) => (
                      <div key={mi} className="flex gap-2 mb-1 last:mb-0">
                        <span className={`text-[10px] font-semibold shrink-0 w-16 pt-0.5 ${msg.name === "{{user1}}" ? "text-[var(--muted)]" : "text-[var(--accent)]"}`}>
                          {msg.name === "{{user1}}" ? "user" : "agent"}
                        </span>
                        <input
                          type="text"
                          value={msg.content?.text ?? ""}
                          onChange={(e) => {
                            const updated = [...(d.messageExamples ?? [])];
                            const convoClone = { examples: [...updated[ci].examples] };
                            convoClone.examples[mi] = { ...convoClone.examples[mi], content: { text: e.target.value } };
                            updated[ci] = convoClone;
                            handleFieldEdit("messageExamples", updated);
                          }}
                          className={inputCls + " flex-1"}
                        />
                      </div>
                    ))}
                  </div>
                ))}
                {(d.messageExamples ?? []).length === 0 && (
                  <div className={hintCls + " py-2"}>no chat examples yet. click generate to create some.</div>
                )}
              </div>
            </details>

            {/* Post Examples */}
            <details className="group">
              <summary className="flex items-center gap-1.5 cursor-pointer select-none text-xs font-semibold list-none [&::-webkit-details-marker]:hidden">
                <span className="inline-block transition-transform group-open:rotate-90">&#9654;</span>
                post examples
                <span className="font-normal text-[var(--muted)]">— social media voice</span>
                <button
                  className={tinyBtnCls + " ml-auto"}
                  onClick={(e) => { e.preventDefault(); void handleGenerate("postExamples", "replace"); }}
                  disabled={generating === "postExamples"}
                  type="button"
                >
                  {generating === "postExamples" ? "generating..." : "generate"}
                </button>
              </summary>
              <div className="flex flex-col gap-1.5 mt-3">
                {(d.postExamples ?? []).map((post: string, pi: number) => (
                  <div key={pi} className="flex gap-2 items-start">
                    <input
                      type="text"
                      value={post}
                      onChange={(e) => {
                        const updated = [...(d.postExamples ?? [])];
                        updated[pi] = e.target.value;
                        handleFieldEdit("postExamples", updated);
                      }}
                      className={inputCls + " flex-1"}
                    />
                    <button
                      className="text-[10px] text-[var(--muted)] hover:text-[var(--danger,#e74c3c)] cursor-pointer shrink-0 py-1.5"
                      onClick={() => {
                        const updated = [...(d.postExamples ?? [])];
                        updated.splice(pi, 1);
                        handleFieldEdit("postExamples", updated);
                      }}
                      type="button"
                    >
                      &times;
                    </button>
                  </div>
                ))}
                {(d.postExamples ?? []).length === 0 && (
                  <div className={hintCls + " py-2"}>no post examples yet. click generate to create some.</div>
                )}
                <button
                  className="text-[11px] text-[var(--muted)] hover:text-[var(--accent)] cursor-pointer self-start mt-0.5"
                  onClick={() => {
                    const updated = [...(d.postExamples ?? []), ""];
                    handleFieldEdit("postExamples", updated);
                  }}
                  type="button"
                >
                  + add post
                </button>
              </div>
            </details>

            {/* Save */}
            <div className="flex items-center gap-3 mt-2 pt-3 border-t border-[var(--border)]">
              <button
                className="btn text-[13px] py-2 px-6 !mt-0"
                disabled={characterSaving}
                onClick={() => void handleSaveCharacter()}
              >
                {characterSaving ? "saving..." : "save character"}
              </button>
              {hasUnsavedChanges && !characterSaving && !characterSaveSuccess && (
                <span className="text-xs text-[var(--muted)]">unsaved changes</span>
              )}
              {characterSaveSuccess && (
                <span className="text-xs text-[var(--ok,#16a34a)]">{characterSaveSuccess}</span>
              )}
              {characterSaveError && (
                <span className="text-xs text-[var(--danger,#e74c3c)]">{characterSaveError}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══ AVATAR ═══ */}
      <div className="mt-4 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="font-bold text-sm mb-1">Avatar</div>
        <AvatarSelector
          selected={selectedVrmIndex}
          onSelect={(i) => setState("selectedVrmIndex", i)}
          onUpload={(file) => {
            const url = URL.createObjectURL(file);
            setState("customVrmUrl", url);
            setState("selectedVrmIndex", 0);
          }}
          showUpload
        />
        <div className="text-xs text-[var(--muted)] mt-3">VRM models by <a href="https://prnth.com/" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline">@prnth</a>.</div>
      </div>
    </div>
  );
}
