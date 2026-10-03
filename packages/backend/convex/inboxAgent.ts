"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { env } from "./_generated/server";
import { authComponent } from "./auth";

const nullableString = { type: ["string", "null"] };
const nullableNumber = { type: ["number", "null"] };
const actionData = {
  type: "object", additionalProperties: false,
  required: ["requestId", "eventId", "title", "contactName", "email", "phone", "organization", "eventDate", "startTime", "endTime", "address", "guestCount", "eventType", "format", "notes", "state", "quoteRevisionReason"],
  properties: {
    requestId: nullableString, eventId: nullableString, title: nullableString, contactName: nullableString, email: nullableString, phone: nullableString, organization: nullableString,
    eventDate: nullableString, startTime: nullableString, endTime: nullableString, address: nullableString, guestCount: nullableNumber,
    eventType: nullableString, format: nullableString, notes: nullableString,
    state: { type: ["string", "null"], enum: ["demanded", "potential", "confirmed", "cancelled", null] },
    quoteRevisionReason: nullableString,
  },
};
const schema = {
  type: "object", additionalProperties: false,
  required: ["summary", "messageType", "probableRequest", "actions"],
  properties: {
    summary: { type: "string" },
    messageType: { type: "string", enum: ["nouvelle_demande", "precision", "modification", "nouvelles_dates", "validation", "refus", "question", "paiement", "document", "modification_devis", "logistique", "non_commercial", "incertain"] },
    probableRequest: { type: "object", additionalProperties: false, required: ["requestId", "label", "confidence", "reason"], properties: { requestId: nullableString, label: nullableString, confidence: { type: "string", enum: ["elevee", "moyenne", "faible"] }, reason: { type: "string" } } },
    actions: { type: "array", items: { type: "object", additionalProperties: false, required: ["type", "label", "confidence", "reason", "data"], properties: { type: { type: "string", enum: ["CREATE_REQUEST", "ATTACH_TO_REQUEST", "UPDATE_REQUEST", "ADD_NOTE", "FLAG_QUOTE_REVISION", "IGNORE"] }, label: { type: "string" }, confidence: { type: "string", enum: ["elevee", "moyenne", "faible"] }, reason: { type: "string" }, data: actionData } } },
  },
};

function responseOutputText(response: { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  return response.output?.flatMap(output => output.content ?? []).find(content => content.type === "output_text")?.text;
}

function openAiErrorMessage(status: number, body: unknown) {
  const message = typeof body === "object" && body !== null && "error" in body
    ? (body as { error?: { message?: unknown } }).error?.message
    : undefined;
  return `OpenAI ${status}${typeof message === "string" ? ` — ${message}` : ""}`;
}

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
    const payload = { mail: loaded.entry, crm: loaded.context.map(item => ({ request: item.request, quotes: item.quotes, recentMessages: item.messages })) };
    try {
      const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: openAiModel, input: [{ role: "system", content: [{ type: "input_text", text: "Tu es un assistant CRM. Tu ne modifies rien. Propose uniquement un plan prudent, fondé exclusivement sur le mail et le contexte ciblé. Ne choisis jamais un dossier ambigu; utilise une confiance faible. Les actions doivent être exploitables par un humain." }] }, { role: "user", content: [{ type: "input_text", text: JSON.stringify(payload) }] }], text: { format: { type: "json_schema", name: "inbox_action_plan", strict: true, schema } } }) });
      const raw = await response.json() as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; error?: { message?: unknown } };
      if (!response.ok) throw new Error(openAiErrorMessage(response.status, raw));
      const text = responseOutputText(raw);
      if (!text) throw new Error("OpenAI a renvoyé une réponse structurée vide.");
      const result = JSON.parse(text) as { summary: string; messageType: string };
      await ctx.runMutation(internal.inboxAgentData.save, { inboxMessageId: args.inboxMessageId, status: "analyzed", summary: result.summary, messageType: result.messageType, plan: JSON.stringify(result), model: openAiModel });
      return { status: "analyzed" as const };
    } catch (error) {
      await ctx.runMutation(internal.inboxAgentData.save, { inboxMessageId: args.inboxMessageId, status: "analysis_failed", error: error instanceof Error ? error.message : "Analyse impossible" });
      throw error;
    }
  },
});
