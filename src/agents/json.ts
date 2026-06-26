// Pull the first balanced JSON object out of a model reply (which may wrap it in prose).
// Internal to the LLM agent; not part of the package's public surface.
export function extractJson(text: string): any | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (char === "\\") esc = true;
      else if (char === '"') inStr = false;
    } else if (char === '"') {
      inStr = true;
    } else if (char === "{") {
      depth++;
    } else if (char === "}" && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}
