import type { FunctionReturnType } from "convex/server";
import type { api } from "@ERPTrisThom/backend/convex/_generated/api";
import type { Parsed1001 } from "./inbox-display";

type Entry = FunctionReturnType<typeof api.inboxEntries.list>[number];
export function siteEntryDefaults(entry: Pick<Entry, "source" | "sourceData" | "senderName" | "senderEmail" | "body">) {
  if (entry.source !== "directus") return undefined;
  const data = entry.sourceData;
  const date = data?.eventDate;
  const eventDate = date !== undefined && Number.isFinite(date)
    ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
    : "";
  const result: Parsed1001 & { notes: string; adminNotes: string; message: string } = {
    name: data?.contactName ?? entry.senderName ?? "",
    email: data?.contactEmail ?? entry.senderEmail ?? "",
    phone: data?.contactPhone ?? "",
    eventType: data?.eventType ?? data?.cateringFormat ?? data?.format ?? "",
    eventDate,
    venue: data?.eventAddress ?? "",
    guests: data?.guestCount,
    notes: [...new Set([data?.cateringFormat, data?.format].filter(Boolean))].join(" · "),
    adminNotes: data?.adminNotes ?? "",
    message: data?.message ?? entry.body ?? "",
  };
  return result;
}
