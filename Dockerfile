# Locked-down sandbox for running an agent against an untrusted workspace.
# The framework ships no permission system by design → the container IS the boundary.
# Run it (see README) with: --cap-drop ALL --security-opt no-new-privileges
# --read-only --tmpfs /tmp --pids-limit 256 --memory 1g and NO docker socket mount,
# so the agent's tools can't escape. Point it at an LLM via OPENAI_BASE_URL.
FROM node:20-slim

WORKDIR /app

# Install deps with the lockfile. --ignore-scripts blocks dependency lifecycle
# (postinstall/preinstall) hooks — the real supply-chain attack vector — and also
# skips our own `prepare` build, which we run explicitly after the source is copied.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
COPY examples ./examples

# Bake the build at image time so the sandbox can run --read-only (only /tmp writable).
RUN npm run build

# Non-root. HOME=/tmp so any tsx/npm cache lands on the writable tmpfs under --read-only.
ENV HOME=/tmp
USER node

# Live solve against any OpenAI-compatible endpoint (set OPENAI_BASE_URL / SKEP_MODEL).
# Append `--mock` for the deterministic no-network path.
CMD ["npx", "tsx", "examples/code-browser/run.ts"]
