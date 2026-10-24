// Precio al cliente = costo Terac + comisión BilingualCheck (doc 01).
// Se redondea a centavos para que coincida exactamente con el importe de Whop.

const cents = (n: number) => Math.round(n * 100) / 100;

export function priceQuote(teracCostUsd: number, feeRate: number) {
  const cost = cents(teracCostUsd);
  const fee = cents(cost * feeRate);
  return { terac_cost_usd: cost, fee_usd: fee, total_usd: cents(cost + fee) };
}
