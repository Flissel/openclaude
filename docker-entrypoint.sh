#!/bin/sh
# OpenClaude Service Entrypoint — Load Docker secrets into env vars

echo "[openclaude] Starting..."

# Load Docker secrets
for secret_file in /run/secrets/*; do
    if [ -f "$secret_file" ]; then
        secret_name=$(basename "$secret_file")
        env_var=$(echo "$secret_name" | tr '[:lower:]' '[:upper:]')
        if [ -z "$(eval echo \$$env_var)" ]; then
            export "$env_var=$(cat $secret_file)"
            echo "[openclaude] Secret: $secret_name -> $env_var"
        fi
    fi
done

# Claude credentials: secret → ~/.claude/.credentials.json
if [ -f "/run/secrets/claude_credentials" ]; then
    mkdir -p /root/.claude
    cp /run/secrets/claude_credentials /root/.claude/.credentials.json
    chmod 600 /root/.claude/.credentials.json
    echo '{}' > /root/.claude/settings.json
    echo "[openclaude] Claude Pro/Max credentials loaded"
fi

# Auto-detect provider mode
if [ "$CLAUDE_CODE_USE_OPENAI" = "1" ]; then
    echo "[openclaude] Provider: OpenAI-compatible (model: ${OPENAI_MODEL:-default})"
elif [ -n "$ANTHROPIC_API_KEY" ] || [ -f "/root/.claude/.credentials.json" ]; then
    echo "[openclaude] Provider: Anthropic (Claude)"
else
    echo "[openclaude] WARNING: No provider configured"
fi

exec "$@"
