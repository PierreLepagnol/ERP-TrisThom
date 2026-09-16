"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { env } from "./_generated/server";
import { authComponent } from "./auth";

const schema = {
  type: "object", additionalProperties: false,
  required: ["summary", "messageType", "probableRequest", "actions"],
  properties: {
    summary: { type: "string" },
    messageType: { type: "string", enum: ["nouvelle_demande", "precision", "modification", "nouvelles_dates", "validation", "refus", "question", "paiement", "document", "modification_devis", "logistique", "non_commercial", "incertain"] },
    probableRequest: { type: "object", additionalProperties: false, required: ["confidence", "reason"], properties: { requestId: { type: ["string", "null"] }, label: { type: ["string", "null"] }, confidence: { type: "string", enum: ["elevee", "moyenne", "faible"] }, reason: { type: "string" } } },
    actions: { type: "array", items: { type: "object", additionalProperties: false, required: ["type", "label", "confidence", "reason", "data"], properties: { type: { type: "string", enum: ["CREATE_REQUEST", "ATTACH_TO_REQUEST", "UPDATE_REQUEST", "CREATE_EVENT", "UPDATE_EVENT", "ADD_NOTE", "FLAG_QUOTE_REVISION", "IGNORE"] }, label: { type: "string" }, confidence: { type: "string", enum: ["elevee", "moyenne", "faible"] }, reason: { type: "string" }, data: { type: "object", additionalProperties: true } } } },
  },
};

export const analyze = action({
  args: { inboxMessageId: v.id("inboxMessages"), force: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    if (!await authComponent.safeGetAuthUser(ctx)) throw new Error("Vous devez être connecté.");
    const loaded = await ctx.runQuery(internal.inboxAgentData.load, { inboxMessageId: args.inboxMessageId });
    if (!loaded) throw new Error("Entrée introuvable.");
    if (loaded.analysis?.status === "analyzed" && !args.force) return { status: "cached" as const };
    // Convex's typed env can lag behind a newly deployed app config. Node actions
    // also receive deployment variables through process.env, so keep this fallback.
    const openAiKey = env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
    const openAiModel = env.OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5-mini";
    if (!openAiKey) throw new Error("OPENAI_API_KEY est manquante.");
    await ctx.runMutation(internal.inboxAgentData.save, { inboxMessageId: args.inboxMessageId, status: "pending_analysis" });
    const payload = { mail: loaded.entry, crm: loaded.context.map(item => ({ request: item.request, events: item.events, quotes: item.quotes, recentMessages: item.messages })) };
    try {
      const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: openAiModel, input: [{ role: "system", content: [{ type: "input_text", text: "Tu es un assistant CRM. Tu ne modifies rien. Propose uniquement un plan prudent, fondé exclusivement sur le mail et le contexte ciblé. Ne choisis jamais un dossier ambigu; utilise une confiance faible. Les actions doivent être exploitables par un humain." }] }, { role: "user", content: [{ type: "input_text", text: JSON.stringify(payload) }] }], text: { format: { type: "json_schema", name: "inbox_action_plan", strict: true, schema } } }) });
      if (!response.ok) throw new Error(`OpenAI ${response.status}`);
      const raw = await response.json() as { output_text?: string };
      const result = JSON.parse(raw.output_text || "{}") as { summary: string; messageType: string };
      await ctx.runMutation(internal.inboxAgentData.save, { inboxMessageId: args.inboxMessageId, status: "analyzed", summary: result.summary, messageType: result.messageType, plan: JSON.stringify(result), model: openAiModel });
      return { status: "analyzed" as const };
    } catch (error) {
      await ctx.runMutation(internal.inboxAgentData.save, { inboxMessageId: args.inboxMessageId, status: "analysis_failed", error: error instanceof Error ? error.message : "Analyse impossible" });
      throw error;
    }
  },
});
