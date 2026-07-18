import { bouillonComptoirBrand as brand } from "@/config/brand";
import { calculateQuoteTotals, type QuoteCalculation } from "@/domain/quote-calculation";
import type { LocalRequest, Quote, QuoteVersion } from "@/lib/local-crm";

const money = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});
const date = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function QuoteDocument({
  quote,
  version,
  request,
}: {
  quote: Quote;
  version: QuoteVersion;
  request: LocalRequest;
}) {
  const calculation = calculateQuoteTotals(version.lines, version.discountCents);
  const offerTitle = version.lines[0]?.label ?? "Proposition Bouillon Comptoir";
  const eventTitle = request.eventType || "Votre événement";
  const clientLines = [
    request.contactName,
    request.organizationName,
    request.contactEmail,
    request.contactPhone,
    request.eventAddress || request.venue,
  ].filter(Boolean);
  const eventMeta = [
    request.eventDate ? date.format(request.eventDate) : undefined,
    [request.eventStartTime, request.eventEndTime]
      .filter(Boolean)
      .join(" – ") || undefined,
    request.guestCount ? `${request.guestCount} convives` : undefined,
    request.eventAddress || request.venue,
  ].filter(Boolean);
  return (
    <article
      className="quote-document-root bg-white text-[#261e1b] shadow-xl"
      style={{ fontFamily: "Work Sans, Arial, sans-serif" }}
    >
      <div className="quote-document-page bg-white p-8 sm:p-12 print:min-h-[297mm] print:p-[12mm]">
        <header className="flex items-start justify-between gap-6 border-b-2 border-[#5a1420] pb-6 print:pb-4">
          <div>
            <img
              src={brand.assets.horizontalLogo}
              alt={brand.commercialName}
              className="h-14 w-auto max-w-56 object-contain object-left print:h-11"
            />
            <p className="mt-3 text-xs font-semibold uppercase tracking-[.13em] text-[#2f4a3d] print:mt-2">
              {brand.tagline}
            </p>
            <p className="mt-1 text-xs text-stone-600">{brand.serviceArea}</p>
          </div>
          <div className="text-right">
            <p
              className="font-serif text-4xl font-bold tracking-wide text-[#5a1420]"
              style={{ fontFamily: "Fraunces, Georgia, serif" }}
            >
              DEVIS
            </p>
            <p className="mt-2 text-sm font-bold">
              {quote.quoteNumber}{" "}
              <span className="font-normal text-stone-500">
                · Version {version.versionNumber}
              </span>
            </p>
            <p className="mt-1 text-xs text-stone-600">
              Émis le {date.format(version.issueDate)}
              <br />
              Valable jusqu’au {date.format(version.validUntil)}
            </p>
          </div>
        </header>
        <section className="mt-6 print:mt-4">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#9e3342]">
            Votre événement
          </p>
          <h1
            className="mt-1 font-serif text-2xl font-bold text-[#5a1420]"
            style={{ fontFamily: "Fraunces, Georgia, serif" }}
          >
            {eventTitle}
          </h1>
          <p className="mt-1 text-base font-semibold text-[#2f4a3d]">
            {offerTitle}
            {request.guestCount ? ` pour ${request.guestCount} convives` : ""}
          </p>
          {eventMeta.length ? (
            <p className="mt-2 text-sm leading-5 text-stone-700">
              {eventMeta.join(" · ")}
            </p>
          ) : null}
        </section>
        <section className="mt-5 grid gap-0 border border-[#d8cdbb] sm:grid-cols-2 print:mt-4">
          <InfoBlock
            title="Prestataire"
            lines={[
              brand.commercialName,
              brand.legalName,
              brand.address,
              `SIRET : ${brand.siret}`,
              brand.phone,
              brand.email,
              brand.website,
            ].filter(Boolean)}
          />
          <InfoBlock title="Client / lieu de l’événement" lines={clientLines} />
        </section>
        {version.introduction ? (
          <section className="mt-8 border-l-4 border-[#d2a24a] bg-white/60 px-5 py-4 text-sm leading-6 text-stone-700 print:mt-5 print:px-4 print:py-3">
            <p className="whitespace-pre-line">{version.introduction}</p>
          </section>
        ) : null}
        <FinancialSummary version={version} calculation={calculation} />
        <DocumentFooter page={1} />
      </div>
      <div className="quote-document-page mt-6 bg-white p-8 sm:p-12 print:mt-0 print:min-h-[297mm] print:break-before-page print:p-[12mm]">
        <section className="border-t border-[#d8cdbb] pt-5">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#9e3342]">
            Notre proposition
          </p>
          <h2
            className="mt-1 font-serif text-2xl font-bold text-[#5a1420]"
            style={{ fontFamily: "Fraunces, Georgia, serif" }}
          >
            {offerTitle}
          </h2>
          <div className="mt-3 grid gap-3">
            {version.lines.map((line) =>
              line.details?.length ? (
                <div
                  key={`${line.id}-composition`}
                  className="border-l-2 border-[#d2a24a] pl-3"
                >
                  <p className="font-semibold">
                    {line.label}
                    {line.quantity > 1
                      ? ` · ${line.quantity} ${line.quantity === 1 ? "unité" : "unités"}`
                      : ""}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-5 text-stone-700">
                    {line.details.join("\n")}
                  </p>
                </div>
              ) : <div key={`${line.id}-missing`} className="border-l-2 border-[#d8cdbb] pl-3 text-sm text-stone-600"><p className="font-semibold text-stone-800">{line.label}</p><p className="mt-1">Détail de la formule à renseigner dans le créateur.</p></div>,
            )}
          </div>
        </section>
        <section className="hidden">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#9e3342]">
            Récapitulatif financier
          </p>
          <table className="mt-2 w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[#5a1420] text-white">
                <th className="px-3 py-2 font-semibold">Prestation</th>
                <th className="px-2 py-2 text-right font-semibold">Qté</th>
                <th className="px-2 py-2 text-right font-semibold">PU HT</th>
                <th className="px-2 py-2 text-right font-semibold">TVA</th>
                <th className="px-3 py-2 text-right font-semibold">Total HT</th>
              </tr>
            </thead>
            <tbody>
              {version.lines.map((line, index) => (
                <tr
                  key={line.id}
                  className="border-b border-[#d8cdbb] [break-inside:avoid]"
                >
                  <td className="px-3 py-2 font-semibold">{line.label}</td>
                  <td className="px-2 py-2 text-right">{line.quantity}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {money.format(line.unitPriceCents / 100)}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {line.vatRate} %
                  </td>
                  <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                    {money.format((calculation.lineTotals[index]?.totalHtCents ?? 0) / 100)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="hidden">
          <Total
            label="Total HT"
            value={money.format(calculation.totalHtCents / 100)}
          />
          {version.discountCents ? (
            <Total
              label="Remise"
              value={`− ${money.format(calculation.appliedDiscountCents / 100)}`}
            />
          ) : null}
          {calculation.vatBreakdown.map((group) => (
            <Total
              key={group.vatRate}
              label={`TVA ${group.vatRate} %`}
              value={money.format(group.vatCents / 100)}
            />
          ))}
          <Total
            label="Montant total de TVA"
            value={money.format(calculation.totalVatCents / 100)}
          />
          <div
            className="mt-3 flex items-baseline justify-between bg-[#5a1420] px-4 py-3 font-serif text-xl font-bold text-white"
            style={{ fontFamily: "Fraunces, Georgia, serif" }}
          >
            <span>Total TTC</span>
            <span>{money.format(calculation.totalTtcCents / 100)}</span>
          </div>
        </section>
        {[
          version.included,
          version.excluded,
          version.logistics,
          version.conditions,
          version.remarks,
          version.depositPercent,
        ].some(Boolean) ? (
          <section className="mt-6 border-t border-[#d8cdbb] pt-4 print:mt-4">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#9e3342]">
              Informations & conditions
            </p>
            <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <CompactInfo title="Inclus" value={version.included} />
              <CompactInfo title="Non inclus" value={version.excluded} />
              <CompactInfo title="Logistique" value={version.logistics} />
              <CompactInfo
                title="Acompte"
                value={
                  version.depositPercent
                    ? `${version.depositPercent} % à la confirmation.`
                    : undefined
                }
              />
              <CompactInfo title="Conditions" value={version.conditions} />
              <CompactInfo title="Remarques" value={version.remarks} />
            </div>
          </section>
        ) : null}
        <DocumentFooter page={2} />
      </div>
    </article>
  );
}

function InfoBlock({
  title,
  lines,
}: {
  title: string;
  lines: Array<string | undefined>;
}) {
  return (
    <div className="p-3 first:border-r first:border-[#d8cdbb] print:p-3">
      <p className="text-xs font-bold uppercase tracking-[.14em] text-[#9e3342]">
        {title}
      </p>
      <div className="mt-3 space-y-0.5 text-sm leading-5 print:mt-2">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}
function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5">
      <span className="text-stone-600">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function FinancialSummary({ version, calculation }: { version: QuoteVersion; calculation: QuoteCalculation }) {
  return <section className="mt-6 border-t border-[#d8cdbb] pt-4"><h2 className="font-serif text-xl font-bold text-[#5a1420]">Récapitulatif chiffré</h2><table className="mt-2 w-full border-collapse text-left text-xs"><thead><tr className="bg-[#650d1c] text-white"><th className="px-3 py-2">Description</th><th className="px-2 py-2 text-right">Qté</th><th className="px-2 py-2 text-right">PU HT</th><th className="px-2 py-2 text-right">TVA</th><th className="px-3 py-2 text-right">Total HT</th></tr></thead><tbody>{version.lines.map((line, index) => <tr key={line.id} className="border-b border-[#e7dfd2]"><td className="px-3 py-2"><strong>{line.label}</strong></td><td className="px-2 py-2 text-right">{line.quantity}</td><td className="px-2 py-2 text-right whitespace-nowrap">{money.format(line.unitPriceCents / 100)}</td><td className="px-2 py-2 text-right">{line.vatRate} %</td><td className="px-3 py-2 text-right font-bold whitespace-nowrap">{money.format((calculation.lineTotals[index]?.totalHtCents ?? 0) / 100)}</td></tr>)}</tbody></table><div className="mt-4 ml-auto w-full max-w-60 border border-[#e7dfd2] text-xs"><Total label="Total HT" value={money.format(calculation.totalHtCents / 100)} />{calculation.appliedDiscountCents ? <Total label="Remise" value={`− ${money.format(calculation.appliedDiscountCents / 100)}`} /> : null}{calculation.vatBreakdown.map((group) => <Total key={group.vatRate} label={`TVA ${group.vatRate} %`} value={money.format(group.vatCents / 100)} />)}<Total label="Total TVA" value={money.format(calculation.totalVatCents / 100)} /><div className="flex justify-between bg-[#650d1c] px-3 py-2 font-bold text-white"><span>TOTAL TTC</span><span>{money.format(calculation.totalTtcCents / 100)}</span></div></div></section>;
}
function CompactInfo({ title, value }: { title: string; value?: string }) {
  return value ? (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-[#5a1420]">
        {title}
      </p>
      <p className="mt-1 whitespace-pre-line text-xs leading-5 text-stone-700">
        {value}
      </p>
    </div>
  ) : null;
}
function DocumentFooter({ page }: { page: number }) {
  return <footer className="mt-10 flex items-center justify-between bg-[#650d1c] px-4 py-3 text-[9px] text-white"><span>{brand.commercialName} · {brand.legalName} · {brand.address} · {brand.email}</span><span>Page {page}/2</span></footer>;
}
