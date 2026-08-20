import { normalizeRequestStatus, requestStatusConfig, type RequestStatus } from "@/domain/request-status";

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const normalized = normalizeRequestStatus(status);
  const config = requestStatusConfig[normalized];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${config.badgeClassName}`}><span className="size-1.5 rounded-full bg-current opacity-70" />{config.label}</span>;
}
