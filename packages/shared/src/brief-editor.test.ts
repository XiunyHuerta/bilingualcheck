import { describe, expect, it } from "vitest";
import { applyBriefDraft, BRIEF_FIELDS, briefEditDraft, type BriefLabels } from "./brief-editor";
import { BriefSchema } from "./schemas";

const brief = BriefSchema.parse({ business: { name: "Cafe", sector: "Food", offer: "Lunch", website: "https://example.com" },
  goal: "Reach new customers", source_language: "es", target_language: "fr", target_market: { country: "FR", city: "Paris" },
  audience: "Clientes franceses", cultural_notes: ["Friendly tone"], deliverable_type: "web_copy", deliverables: ["Landing", "Ads"],
  acceptance_criteria: ["Local tone"], asset_ids: ["existing-file"], deadline_days: 7, budget_usd: 200, professional_profile: "Copywriter" });
const labels = Object.fromEntries(BRIEF_FIELDS.map(key => [key, key])) as BriefLabels;

describe("edición del brief en el mensaje", () => {
  it("copia el valor y sustituye franceses por suecos sin perder el resto del brief", () => {
    expect(briefEditDraft(brief, "audience", labels)).toBe("Clientes franceses");
    const changed = applyBriefDraft(brief, "audience", "Clientes suecos", labels);
    expect(changed).toEqual({ ...brief, audience: "Clientes suecos" });
    expect(brief.audience).toBe("Clientes franceses");
  });
  it("permite editar todo y borrar los valores opcionales", () => {
    const draft = briefEditDraft(brief, "all", labels).replace("Clientes franceses", "Clientes suecos")
      .replace("target_language:\nfr", "target_language:\nsv").replace("https://example.com", "").replace("budget_usd:\n200", "budget_usd:\n");
    const changed = applyBriefDraft(brief, "all", draft, labels);
    expect(changed.audience).toBe("Clientes suecos"); expect(changed.target_language).toBe("sv");
    expect(changed.business.website).toBeUndefined(); expect(changed.budget_usd).toBeUndefined();
    expect(changed.asset_ids).toEqual(brief.asset_ids);
  });
  it("admite listas y eliminar las notas opcionales, sin vaciar campos obligatorios", () => {
    expect(applyBriefDraft(brief, "deliverables", "• Landing\n• Menu", labels).deliverables).toEqual(["Landing", "Menu"]);
    expect(applyBriefDraft(brief, "cultural_notes", "", labels).cultural_notes).toEqual([]);
    expect(() => applyBriefDraft(brief, "audience", "", labels)).toThrow();
  });
  it("conserva el país al editar el mercado y detecta campos perdidos o duplicados", () => {
    const draft = briefEditDraft(brief, "market", labels).replace("Paris", "Stockholm").replace("FR", "SE");
    expect(applyBriefDraft(brief, "market", draft, labels).target_market).toEqual({ city: "Stockholm", country: "SE" });
    expect(() => applyBriefDraft(brief, "all", "Solo un texto sin campos", labels)).toThrow();
    const full = briefEditDraft(brief, "all", labels);
    expect(() => applyBriefDraft(brief, "all", full + "\naudience:\nOther", labels)).toThrow();
  });
});
