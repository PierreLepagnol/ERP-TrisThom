import { useConvex } from "convex/react";
import { useEffect } from "react";
import { api } from "@ERPTrisThom/backend/convex/_generated/api";
import type { Id } from "@ERPTrisThom/backend/convex/_generated/dataModel";

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
};
type ModelContext = { registerTool: (tool: ToolDefinition, options?: { signal?: AbortSignal }) => void | (() => void) };
type ModelContextDocument = Document & { modelContext?: ModelContext };
type ModelContextNavigator = Navigator & { modelContext?: ModelContext };

export function getModelContext(): ModelContext | undefined {
  if (typeof document === "undefined") return undefined;
  return (document as ModelContextDocument).modelContext ?? (typeof navigator === "undefined" ? undefined : (navigator as ModelContextNavigator).modelContext);
}

const limitSchema = { type: "object", additionalProperties: false, properties: { limit: { type: "number", minimum: 1, maximum: 20 } } };
const entrySchema = { type: "object", additionalProperties: false, required: ["inboxMessageId"], properties: { inboxMessageId: { type: "string" } } };
const requestSchema = { type: "object", additionalProperties: false, required: ["query"], properties: { query: { type: "string" }, limit: { type: "number", minimum: 1, maximum: 20 } } };
const requestIdSchema = { type: "object", additionalProperties: false, required: ["requestId"], properties: { requestId: { type: "string" } } };

export function useBouillonSiteTools() {
  const convex = useConvex();
  useEffect(() => {
    const modelContext = getModelContext();
    if (!modelContext) return;
    const controller = new AbortController();
    const unregister = [
      modelContext.registerTool({ name: "bc_list_pending_entries", description: "Liste les nouvelles entrées commerciales Bouillon Comptoir qui restent à traiter.", inputSchema: limitSchema, execute: args => convex.query(api.siteTools.listPendingEntries, { limit: typeof args.limit === "number" ? args.limit : undefined }) }, { signal: controller.signal }),
      modelContext.registerTool({ name: "bc_get_entry_context", description: "Récupère le contenu complet d’une entrée commerciale et le contexte CRM pertinent permettant à ChatGPT de l’analyser.", inputSchema: entrySchema, execute: args => convex.query(api.siteTools.getEntryContext, { inboxMessageId: String(args.inboxMessageId) as Id<"inboxMessages"> }) }, { signal: controller.signal }),
      modelContext.registerTool({ name: "bc_search_requests", description: "Recherche des dossiers CRM Bouillon Comptoir pouvant correspondre à un client, contact, entreprise ou événement.", inputSchema: requestSchema, execute: args => convex.query(api.siteTools.searchRequests, { query: String(args.query), limit: typeof args.limit === "number" ? args.limit : undefined }) }, { signal: controller.signal }),
      modelContext.registerTool({ name: "bc_get_request_context", description: "Récupère le contexte complet utile d’un dossier Bouillon Comptoir.", inputSchema: requestIdSchema, execute: args => convex.query(api.siteTools.getRequestContext, { requestId: String(args.requestId) as Id<"requests"> }) }, { signal: controller.signal }),
    ];
    if (import.meta.env.DEV) console.info("Bouillon Comptoir Site Tools registered: 4");
    return () => { controller.abort(); unregister.forEach(value => { if (typeof value === "function") value(); }); };
  }, [convex]);
}
