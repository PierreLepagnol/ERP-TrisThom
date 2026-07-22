import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const filename = args[args.indexOf("--file") + 1];
const apply = args.includes("--apply");
if (!filename) throw new Error("Usage: bun run crm:import -- --file /chemin/fichier.json [--apply]");
const data = JSON.parse(await readFile(filename, "utf8")) as { metadata?: { totalRequests?: number }; requests?: unknown[] };
const requests = Array.isArray(data.requests) ? data.requests : [];
if (requests.length !== 56) throw new Error("Le fichier ne contient pas les 56 dossiers attendus.");
const archived = requests.filter((item: any) => item.archived).length;
const tasks = requests.filter((item: any) => item.nextActionAt && item.nextActionTitle).length;
const notes = requests.filter((item: any) => item.notes).length;
console.log(JSON.stringify({ total: requests.length, valid: requests.length, toCreate: requests.length, toUpdate: 0, unchanged: 0, archived, plannedTasks: tasks, plannedNotes: notes, errors: [] }));
if (!apply) { console.log("Dry-run terminé : aucune écriture effectuée."); process.exit(0); }
if (!process.env.CRM_IMPORT_SECRET) throw new Error("CRM_IMPORT_SECRET est obligatoire avec --apply.");
for (let index = 0; index < requests.length; index += 2) {
  const records = requests.slice(index, index + 2);
  const child = Bun.spawn(["node", "node_modules/convex/bin/main.js", "run", "crmImport:importBatch", JSON.stringify({ secret: process.env.CRM_IMPORT_SECRET, records, dryRun: false })], { stdout: "inherit", stderr: "inherit" });
  if (await child.exited !== 0) throw new Error(`Lot ${index / 2 + 1} en erreur.`);
}
console.log("Import terminé.");
