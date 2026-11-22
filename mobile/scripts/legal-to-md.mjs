// Regenerates docs/legal/{TERMS,PRIVACY}.md from src/lib/legal.ts (the texts shown in the app).
// Usage (Node >= 22.18 / 23.6, which strip TypeScript types natively): node scripts/legal-to-md.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { LEGAL } from "../src/lib/legal.ts";

const out = new URL("../../docs/legal/", import.meta.url);
mkdirSync(out, { recursive: true });
const banner = "> **DRAFT — NOT LEGAL ADVICE.** Must be reviewed by a Cameroonian lawyer before launch: fill every [placeholder] and confirm each reference to Law No. 2024/017 of 23 December 2024 on personal data protection. Generated from `mobile/src/lib/legal.ts` by `mobile/scripts/legal-to-md.mjs`.\n";
for (const [doc, file] of [["terms", "TERMS.md"], ["privacy", "PRIVACY.md"]]) {
  const parts = [banner];
  for (const lang of ["fr", "en"]) {
    const d = LEGAL[doc][lang];
    parts.push(`\n# ${d.title}\n\n_${lang === "fr" ? "Mise à jour" : "Updated"}: ${d.updated}_\n`);
    for (const s of d.sections) parts.push(`\n## ${s.title}\n\n${s.body}\n`);
  }
  writeFileSync(new URL(file, out), parts.join(""));
  console.log(`wrote docs/legal/${file}`);
}
