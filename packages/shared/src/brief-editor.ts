import { BriefSchema, type Brief } from "./schemas";

export const BRIEF_FIELDS = ["business.name", "business.sector", "business.offer", "business.website", "goal",
  "source_language", "target_language", "target_market.city", "target_market.region", "target_market.country",
  "audience", "cultural_notes", "deliverable_type", "deliverables", "acceptance_criteria", "deadline_days",
  "budget_usd", "professional_profile"] as const;
export type BriefField = typeof BRIEF_FIELDS[number];
export type BriefEditField = BriefField | "all" | "market";
export type BriefLabels = Record<BriefField, string>;
const arrays = new Set<string>(["deliverables", "cultural_notes", "acceptance_criteria"]);
const optional = new Set<string>(["business.website", "target_market.city", "target_market.region", "deadline_days", "budget_usd"]);
const selected = (field: BriefEditField): readonly BriefField[] => field === "all" ? BRIEF_FIELDS :
  field === "market" ? ["target_market.city", "target_market.region", "target_market.country"] : [field];

function read(brief: Brief, field: BriefField): string {
  const [parent, child] = field.split(".");
  const record = brief as unknown as Record<string, unknown>;
  const value = child ? (record[parent!] as Record<string, unknown>)[child] : record[parent!];
  return Array.isArray(value) ? value.join("\n") : value == null ? "" : String(value);
}

/** Texto editable en el compositor, sin JSON ni claves técnicas visibles. */
export function briefEditDraft(brief: Brief, field: BriefEditField, labels: BriefLabels): string {
  const fields = selected(field);
  return fields.length === 1 ? read(brief, fields[0]!) : fields.map(key => `${labels[key]}:\n${read(brief, key)}`).join("\n\n");
}

/** Solo cambia los campos elegidos; mantiene IDs de archivos y todo el contexto restante. */
export function applyBriefDraft(brief: Brief, field: BriefEditField, draft: string, labels: BriefLabels): Brief {
  const fields = selected(field);
  const values = new Map<BriefField, string>();
  if (fields.length === 1) values.set(fields[0]!, draft);
  else {
    const lookup = new Map(fields.map(key => [`${labels[key]}:`, key]));
    let current: BriefField | undefined;
    for (const line of draft.split(/\r?\n/)) {
      const key = lookup.get(line.trim());
      if (key) {
        if (values.has(key)) throw new Error("duplicate_field");
        current = key; values.set(key, "");
      } else if (current) values.set(current, `${values.get(current)}\n${line}`);
      else if (line.trim()) throw new Error("missing_field_label");
    }
    if (values.size !== fields.length) throw new Error("missing_field_label");
  }
  const next = { ...brief, business: { ...brief.business }, target_market: { ...brief.target_market } } as unknown as Record<string, unknown>;
  for (const [key, value] of values) {
    const text = value.trim();
    const [parent, child] = key.split(".");
    const target = child ? next[parent!] as Record<string, unknown> : next;
    const property = child ?? parent!;
    if (!text && optional.has(key)) delete target[property];
    else if (arrays.has(key)) target[property] = text.split(/\r?\n/).map(line => line.replace(/^\s*[•*-]\s*/, "").trim()).filter(Boolean);
    else if (key === "deadline_days" || key === "budget_usd") target[property] = Number(text);
    else target[property] = text;
  }
  return BriefSchema.parse(next);
}
