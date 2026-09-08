import { commercialStatusValues, normalizeRequestStatus, requestStatusConfig, type CommercialStatus, type RequestStatus } from "@/domain/request-status";

export function RequestStatusSelect({ status, onChange, label }: { status: RequestStatus; onChange: (status: CommercialStatus) => void; label: string }) {
  const current = normalizeRequestStatus(status);
  const config = requestStatusConfig[current];
  return <span className={`relative inline-flex items-center rounded-full ring-1 ${config.badgeClassName}`}><span className="pointer-events-none absolute left-2.5 size-1.5 rounded-full bg-current opacity-70" /><select aria-label={label} value={current} onClick={(event) => event.stopPropagation()} onChange={(event) => { event.stopPropagation(); onChange(event.target.value as CommercialStatus); }} className="cursor-pointer appearance-none bg-transparent py-1 pl-5 pr-2.5 text-xs font-bold outline-none"><>{commercialStatusValues.map((value) => <option key={value} value={value}>{requestStatusConfig[value].label}</option>)}</></select></span>;
}
