const labels: Record<string, string> = { directus: "Site", email: "E-mail", "1001traiteur": "1001Traiteur", manuel: "Manuel", telephone: "Téléphone" };
export function RequestSourceBadge({ source }: { source: string }) { return <span className="inline-flex rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">{labels[source] ?? source}</span>; }
