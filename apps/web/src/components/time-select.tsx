export const halfHourTimes = Array.from({ length: 48 }, (_, index) => {
  const hours = String(Math.floor(index / 2)).padStart(2, "0");
  return `${hours}:${index % 2 ? "30" : "00"}`;
});

export function nextHalfHour(value: string) {
  const index = halfHourTimes.indexOf(value);
  return index >= 0 && index < halfHourTimes.length - 1 ? halfHourTimes[index + 1] : "";
}

export function TimeSelect({ name, value, onChange }: { name: string; value?: string; onChange?: (value: string) => void }) {
  return <select name={name} value={value} onChange={(event) => onChange?.(event.target.value)} className="input">
    <option value="">À confirmer</option>
    {halfHourTimes.map((time) => <option key={time} value={time}>{time.replace(":", " h ")}</option>)}
  </select>;
}
