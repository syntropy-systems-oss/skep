# Security Policy

## The threat model you should assume

`@syntropy-systems/skep` is an agent runtime. It executes whatever capabilities its **cells** expose —
filesystem access, shell, HTTP, third-party tools — driven by a (often non-deterministic)
model. There is **no built-in permission system, sandbox, or allowlist**. That is a
deliberate design choice: the runtime stays minimal, and isolation is the host's job.

When you run Skep against untrusted input, untrusted repositories, or in an autonomous
loop, the **process boundary is your security boundary**. Treat the agent as capable of
doing anything its cells allow.

### Recommended isolation

- Run inside a locked-down container. The included `Dockerfile` demonstrates a hardened
  pattern: `--cap-drop ALL`, `--security-opt no-new-privileges`, `--read-only` with a
  writable `tmpfs`, pid/memory limits, and **no docker socket mount**.
- Only register cells whose capabilities you intend the agent to have. Prefer the `scout`
  role (read effects) over `worker` (read/write) unless writes are required.
- Never bake secrets into cell content or goals — they become model-visible context.
- Keep `OPENAI_API_KEY` and other credentials in the environment, not in source.

## Supported versions

This project is pre-1.0; only the latest published version receives fixes.

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue. Either:

- use the repository's **GitHub Security Advisories** ("Report a vulnerability"), or
- email **bryson@syntropy.systems**.

Either way the report stays confidential until a fix is available. We aim to acknowledge
reports within a few days.
