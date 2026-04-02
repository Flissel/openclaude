/**
 * OpenClaude HTTP Service — Exposes openclaude CLI as an OpenAI-compatible API.
 *
 * Endpoints:
 *   POST /v1/chat/completions  — Run openclaude with messages, return completion
 *   GET  /health               — Health check
 *   GET  /config               — Show current provider config
 *
 * Environment:
 *   PORT                  — Listen port (default: 8091)
 *   CLAUDE_CODE_USE_OPENAI — Set to "1" for OpenAI-compatible providers
 *   OPENAI_API_KEY        — API key for the provider
 *   OPENAI_BASE_URL       — Provider base URL (e.g. OpenRouter)
 *   OPENAI_MODEL          — Default model
 */

const PORT = parseInt(process.env.PORT || "8091", 10);

interface ChatMessage {
  role: string;
  content?: string;
}

interface ChatRequest {
  model?: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  agent_role?: string;
}

const server = Bun.serve({
  port: PORT,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // Health check
    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        service: "openclaude-service",
        provider: process.env.CLAUDE_CODE_USE_OPENAI === "1" ? "openai-shim" : "anthropic",
        model: process.env.OPENAI_MODEL || "default",
        base_url: process.env.OPENAI_BASE_URL || "anthropic",
      });
    }

    // Config
    if (url.pathname === "/config") {
      return Response.json({
        use_openai: process.env.CLAUDE_CODE_USE_OPENAI === "1",
        model: process.env.OPENAI_MODEL,
        base_url: process.env.OPENAI_BASE_URL,
        has_api_key: !!process.env.OPENAI_API_KEY,
        has_anthropic_key: !!process.env.ANTHROPIC_API_KEY,
        has_credentials: await Bun.file(`${process.env.HOME || "/root"}/.claude/.credentials.json`).exists(),
      });
    }

    // Chat completions
    if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
      try {
        const body: ChatRequest = await req.json();
        const start = Date.now();

        // Build prompt from messages
        const parts: string[] = [];
        for (const msg of body.messages) {
          if (!msg.content) continue;
          if (msg.role === "system") {
            parts.push(`<system>\n${msg.content}\n</system>`);
          } else if (msg.role === "user") {
            parts.push(msg.content);
          } else if (msg.role === "assistant") {
            parts.push(`[Previous response]\n${msg.content}`);
          }
        }
        const prompt = parts.join("\n\n");

        // Build openclaude command
        const bunExe = process.argv[0]; // e.g. C:\Users\User\.bun\bin\bun.exe or /usr/local/bin/bun
        const cmd = [
          bunExe, "run", "dist/cli.mjs",
          "--dangerously-skip-permissions",
          "--output-format", "text",
          "-p", prompt,
        ];

        // Override model if specified in request
        if (body.model) {
          // Set as env var for the subprocess
        }

        const proc = Bun.spawn(cmd, {
          cwd: import.meta.dir,
          env: {
            ...process.env,
            // Override model from request if provided
            ...(body.model ? { OPENAI_MODEL: body.model } : {}),
          },
          stdout: "pipe",
          stderr: "pipe",
        });

        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;

        const latencyMs = Date.now() - start;

        if (exitCode !== 0) {
          console.error(`[openclaude] exit ${exitCode}: ${stderr.slice(0, 500)}`);
          return Response.json(
            {
              error: {
                message: stderr.trim() || `Exit code ${exitCode}`,
                type: "backend_error",
              },
            },
            { status: 502 }
          );
        }

        const content = stdout.trim();
        const wordCount = content.split(/\s+/).length;

        return Response.json({
          id: `oc-${Date.now().toString(36)}`,
          object: "chat.completion",
          model: body.model || process.env.OPENAI_MODEL || "openclaude",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: Math.ceil(prompt.length / 4),
            completion_tokens: wordCount * 2,
            total_tokens: Math.ceil(prompt.length / 4) + wordCount * 2,
          },
          backend: "openclaude",
          latency_ms: latencyMs,
        });
      } catch (err: any) {
        return Response.json(
          { error: { message: err.message, type: "internal_error" } },
          { status: 500 }
        );
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
});

console.log(`OpenClaude Service listening on http://0.0.0.0:${PORT}`);
console.log(`  POST /v1/chat/completions  — OpenAI-compatible chat`);
console.log(`  GET  /health               — Health check`);
console.log(`  GET  /config               — Provider config`);
