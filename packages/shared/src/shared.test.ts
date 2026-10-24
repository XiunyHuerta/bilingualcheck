import { describe, expect, it } from "vitest";
import { BriefSchema, canTransition, isValidLanguageTag, languageName, priceQuote } from "./index";

describe("máquina de estados", () => {
  it("solo awaiting_payment puede pasar a paid", () => {
    expect(canTransition("awaiting_payment", "paid")).toBe(true);
    expect(canTransition("quoted", "paid")).toBe(false);
    expect(canTransition("brief_ready", "recruiting")).toBe(false);
  });
});

describe("idiomas", () => {
  it("acepta cualquier par BCP-47", () => {
    for (const t of ["es", "en-US", "pt-BR", "ko", "zh-Hant-TW"]) expect(isValidLanguageTag(t)).toBe(true);
    expect(isValidLanguageTag("no_es_un_codigo!")).toBe(false);
  });
  it("muestra el nombre en el idioma del usuario", () => {
    expect(languageName("ko", "es")).toBe("coreano");
  });
});

describe("precio", () => {
  it("suma comisión y redondea a centavos", () => {
    expect(priceQuote(84, 0.3)).toEqual({ terac_cost_usd: 84, fee_usd: 25.2, total_usd: 109.2 });
  });
});

describe("brief", () => {
  it("valida el caso de Miami", () => {
    const r = BriefSchema.safeParse({
      business: { name: "Clínica Sonrisa", sector: "salud dental", offer: "limpieza y blanqueamiento" },
      goal: "atraer clientes angloparlantes",
      source_language: "es",
      target_language: "en-US",
      target_market: { city: "Miami", region: "FL", country: "US" },
      audience: "familias jóvenes angloparlantes de Brickell",
      deliverable_type: "campaign_adaptation",
      deliverables: ["3 anuncios para Instagram"],
      acceptance_criteria: ["Suena natural para un nativo de Miami"],
      professional_profile: "especialista en marketing para el mercado anglo de Miami",
    });
    expect(r.success).toBe(true);
  });
});
