
import { AgentRuntime } from "@elizaos/core";
import { ModelType } from "@elizaos/core";
import { localAiPlugin } from "../plugins/plugin-local-embedding/typescript/src/index.ts";

// Mock Logger
const mockLogger = {
    log: () => { },
    info: () => { },
    warn: () => { },
    error: () => { },
    debug: () => { },
    success: () => { },
};

// Mock OpenAI Plugin (simulated)
const mockOpenAiPlugin = {
    name: "openai",
    description: "Mock OpenAI Plugin",
    init: async () => { },
    models: {
        [ModelType.TEXT_EMBEDDING]: async () => {
            return [0.1, 0.2, 0.3];
        },
    },
    // Default priority is 0
};

async function verifyCompatibility() {
    console.log("Starting compatibility verification...");

    const runtime = new AgentRuntime({
        token: "test-token",
        modelProvider: "openai", // Simulate OpenAI provider selection
    });

    // Inject mock logger
    runtime.logger = mockLogger;

    // Register OpenAI first (to test if priority overrides registration order)
    await runtime.registerPlugin(mockOpenAiPlugin);
    console.log("Registered Mock OpenAI Plugin");

    // Register Local AI
    // We need to mock environment variables for it to initialize without errors
    process.env.LOCAL_EMBEDDING_MODEL = "nomic-embed-text-v1.5.Q5_K_M.gguf";
    process.env.MODELS_DIR = "/tmp/models";

    // Mock internal setup of localAiPlugin if needed, or just let it try to init
    // The init might fail if paths don't exist, but we care about registration priority.
    // runtime.registerPlugin calls init(). localAiPlugin.init calls initializeEnvironment().

    // We might need to mock localAIManager to avoid actual filesystem/download ops during init.
    // But for this integration test, we might just rely on the fact that we set env vars.
    // OR we can inspect the runtime.models array directly without running init fully if we mock the plugin object.
    // But we want to test the REAL localAiPlugin object to ensure it has priority: 10.

    try {
        await runtime.registerPlugin(localAiPlugin);
        console.log("Registered Local AI Plugin");
    } catch (e) {
        console.warn("Local AI Plugin init failed (expected without models), but registration might have succeeded:", e.message);
    }

    // Check priorities
    const embeddingHandlers = runtime.models.get(ModelType.TEXT_EMBEDDING);

    if (!embeddingHandlers || embeddingHandlers.length === 0) {
        console.error("FAILED: No embedding handlers registered");
        process.exit(1);
    }

    console.log(`Found ${embeddingHandlers.length} embedding handlers.`);

    const topHandler = embeddingHandlers[0];
    console.log(`Top handler provider: ${topHandler.provider} (Priority: ${topHandler.priority})`);

    if (topHandler.provider !== "local-ai") {
        console.error(`FAILED: Expected 'local-ai' to be top handler, but got '${topHandler.provider}'`);
        console.log("All handlers:");
        embeddingHandlers.forEach((h, i) => {
            console.log(`  ${i}: ${h.provider} (Priority: ${h.priority})`);
        });
        process.exit(1);
    }

    console.log("SUCCESS: Local AI plugin took precedence for embeddings.");
}

verifyCompatibility().catch(e => {
    console.error("Verification failed with error:", e);
    process.exit(1);
});
