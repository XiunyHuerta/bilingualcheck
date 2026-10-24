// Descubre los filtros de Terac para construir el mapa de src/terac/filters.ts.
// Uso: pnpm terac:filters [slug]   (requiere TERAC_API_KEY)
import { terac } from "../src/terac/client";

process.env.TERAC_MODE = "live";
const slug = process.argv[2];
if (slug) {
  console.log(JSON.stringify(await terac.filterOptions(slug), null, 2));
} else {
  for (const f of await terac.listFilters()) console.log(JSON.stringify(f));
  console.log("\nPara ver las opciones de uno: pnpm terac:filters <slug>");
}
