import { BriefSchema, SubmissionReviewSchema } from "@bc/shared";

export const miamiBrief = BriefSchema.parse({
  business: { name: "Sonrisa Miami · ejemplo", sector: "Clínica dental familiar", offer: "Consulta inicial para nuevos pacientes; condiciones a confirmar por el negocio." },
  goal: "Adaptar tres anuncios para residentes angloparlantes de Miami sin perder el tono cercano del negocio.",
  source_language: "es", target_language: "en", target_market: { city: "Miami", region: "Florida", country: "US" },
  audience: "Adultos angloparlantes que buscan atención dental en su barrio.",
  cultural_notes: ["Evitar promesas clínicas o resultados garantizados.", "Mantener un tono cercano y sin estereotipos."],
  deliverable_type: "campaign_adaptation", deliverables: ["Textos en inglés de tres anuncios", "Notas culturales", "Recomendaciones para la web"],
  acceptance_criteria: ["Inglés natural", "Oferta preservada sin inventar precios", "Tres anuncios con explicación cultural y recomendaciones web"],
  professional_profile: "Profesional de copywriting bilingüe familiarizado con Miami.", asset_ids: [], deadline_days: 7,
});

export const miamiDelivery = `ILLUSTRATIVE DEMO — no real professional was hired.

Ad 1: A neighborhood dental team, here for your next chapter. Ask us about an initial consultation for new patients. Contact Sonrisa Miami to learn about availability and conditions.

Ad 2: Your next dental visit can start with a conversation. Meet a local team and ask your questions before you decide. Get in touch for new-patient consultation details.

Ad 3: Looking for dental care close to home? Sonrisa Miami welcomes new patients. Ask our team about an initial consultation and the conditions that apply.

Cultural notes: We replaced literal family idioms with direct, welcoming language. The call to action is clear and does not assume a family structure or cultural background. We added no prices, medical claims or guaranteed results.

Website recommendations: Add an English contact page, explain consultation conditions, keep the phone and address visible, and label language choices with names instead of flags.`;

export const miamiReview = SubmissionReviewSchema.parse({
  meets_brief: true,
  criteria: miamiBrief.acceptance_criteria.map((criterion) => ({ criterion, met: true, note: "Evaluación ilustrativa de la demo; no es una llamada real a la IA." })),
  cultural_changes_explained: "Ejemplo simulado: el tono se hizo directo y cercano, sin expresiones familiares literales. Se conservó la oferta sin añadir precios ni promesas clínicas.",
  issues: [],
});
