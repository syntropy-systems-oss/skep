// Markup is safe by default: values interpolated into `xml` are escaped unless they are
// themselves Markup (e.g. a nested `xml` fragment), which passes through untouched. Use
// `raw()` to inject a trusted string without escaping.
export class Markup {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

export type Renderable = Markup | string | number | boolean | null | undefined | Renderable[];

export function xml(strings: TemplateStringsArray, ...values: Renderable[]): Markup {
  let out = "";
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) out += render(values[i]);
  }
  return new Markup(out.trim());
}

// Escape hatch: treat a string as already-safe markup (no escaping).
export function raw(value: unknown): Markup {
  return new Markup(String(value));
}

export function showIf(condition: unknown, value: Renderable): Markup {
  return new Markup(condition ? render(value) : "");
}

function render(value: Renderable): string {
  if (value === false || value === null || value === undefined) return "";
  if (value instanceof Markup) return value.value;
  if (Array.isArray(value)) return value.map(render).filter(Boolean).join("\n");
  return escape(String(value));
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
