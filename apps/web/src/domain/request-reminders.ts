import type { LocalRequest } from "@/lib/local-crm";

export type RequestReminder = {
  requestId: string;
  requestName: string;
  title: string;
  dueAt: number;
  followUpId: string;
};

export function openManualReminders(requests: LocalRequest[]): RequestReminder[] {
  return requests
    .flatMap((request) =>
      request.followUps
        .filter((followUp) => followUp.kind === "manuel" && !followUp.completedAt)
        .map((followUp) => ({
          requestId: request._id,
          requestName: request.contactName,
          title: followUp.title,
          dueAt: followUp.dueAt,
          followUpId: followUp.id,
        })),
    )
    .sort((left, right) => left.dueAt - right.dueAt);
}
