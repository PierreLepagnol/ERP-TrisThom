import {
  Link,
  Outlet,
  createFileRoute,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import {
  Archive,
  Check,
  ChevronLeft,
  Clipboard,
  MessageSquare,
  Save,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  activeRequestStatuses,
  getAllowedRequestStatuses,
  requestStatusConfig,
  type RequestStatus,
} from "@/domain/request-status";
import {
  getRequestNextAction,
  getRequestQualification,
  type QualificationCriterion,
} from "@/domain/request-qualification";
import { legacyQuoteFromVersion, type LocalRequest, type Quote, useLocalCrm } from "@/lib/local-crm";

function FollowUps({
  request,
  onComplete,
}: {
  request: LocalRequest;
  onComplete: (followUpId: string) => Promise<void>;
}) {
  const active = request.followUps
    .filter((item) => !item.completedAt)
    .sort((a, b) => a.dueAt - b.dueAt);
  if (active.length === 0) return null;
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[.14em] text-[#7d6f67] uppercase">
            Suivi commercial
          </p>
          <h2 className="mt-1 font-serif text-2xl font-bold">
            Relances à effectuer
          </h2>
        </div>
        <p className="text-sm font-bold text-[#8b1629]">
          {active.length} action{active.length > 1 ? "s" : ""} en attente
        </p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {active.map((followUp) => (
          <article
            key={followUp.id}
            className="flex items-center justify-between gap-4 rounded-lg bg-[#fffaf4] p-4"
          >
            <div>
              <p className="font-semibold">{followUp.title}</p>
              <time className="mt-1 block text-xs text-stone-500">
                Échéance : {timeFormat.format(followUp.dueAt)}
              </time>
            </div>
            <button
              type="button"
              onClick={() => void onComplete(followUp.id)}
              className="shrink-0 rounded-md border border-[#d9b8bf] bg-white px-3 py-2 text-xs font-bold text-[#8b1629]"
            >
              Terminer
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export const Route = createFileRoute("/_auth/requests/$requestId")({
  component: RequestDetailPage,
});

const sourceLabels: Record<string, string> = {
  manuel: "Saisie manuelle",
  telephone: "Téléphone",
  "1001traiteur": "1001traiteur",
  directus: "Formulaire du site",
  email: "E-mail",
};
const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function RequestDetailPage() {
  const { requestId } = Route.useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    requests,
    archivedRequests,
    quotes,
    updateRequest,
    updateStatus,
    qualifyRequest,
    addNote,
    markHandled,
    startQuotePreparation,
    markQuoteSent,
    scheduleFollowUp,
    confirmService,
    closeRequest,
    archiveRequest,
    restoreRequest,
    completeFollowUp,
    createQuoteVersion,
  } = useLocalCrm();
  const request = [...requests, ...archivedRequests].find(
    (item) => item._id === requestId,
  );
  const quoteRecord = quotes.find((item) => item.requestId === requestId);
  const [messageOpen, setMessageOpen] = useState(false);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [actionDialog, setActionDialog] = useState<
    "followUp" | "refuse" | "annule" | null
  >(null);

  useEffect(() => {
    if (request) setForm(toForm(request));
  }, [request]);
  const qualification = useMemo(
    () => (request ? getRequestQualification(request) : []),
    [request],
  );
  const missingCriteria = qualification.filter(
    (criterion) => !criterion.complete,
  );
  const draftMessage = useMemo(
    () =>
      request
        ? `Bonjour ${request.contactName},\n\nPour pouvoir préparer votre devis, pourriez-vous nous préciser : ${missingCriteria.map((criterion) => criterion.label).join(", ") || "les derniers éléments de votre demande"} ?\n\nMerci et à bientôt,\nBouillon Comptoir`
        : "",
    [missingCriteria, request],
  );
  if (location.pathname.endsWith("/quote")) return <Outlet />;
  if (!request) return <EmptyRequest />;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await updateRequest(request!._id, fromForm(form));
    setEditing(false);
    toast.success("Dossier enregistré localement");
  }
  async function changeStatus(status: RequestStatus) {
    try {
      await updateStatus({
        requestId: request!._id,
        status,
        eventStartTime: request!.eventStartTime,
        eventEndTime: request!.eventEndTime,
      });
      toast.success("Statut mis à jour");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de modifier le statut",
      );
    }
  }
  async function copyMessage() {
    await navigator.clipboard.writeText(request!.message ?? "");
    toast.success("Message copié");
  }
  async function quote() {
    if (missingCriteria.length) {
      toast.error(
        `À compléter : ${missingCriteria.map((criterion) => criterion.label).join(", ")}`,
      );
      return;
    }
    await startQuotePreparation(request!._id);
    navigate({
      to: "/requests/$requestId/quote",
      params: { requestId: request!._id },
    });
  }
  async function runPrimaryAction() {
    try {
      if (nextAction.kind === "contact") {
        setMessageOpen(true);
        return;
      }
      if (nextAction.kind === "qualify") {
        await qualifyRequest(request!._id);
        toast.success("Demande qualifiée");
        return;
      }
      if (nextAction.kind === "quote" || nextAction.kind === "review_quote") {
        await quote();
        return;
      }
      if (nextAction.kind === "send_quote") {
        await markQuoteSent(request!._id);
        toast.success("Devis marqué comme envoyé");
        return;
      }
      if (nextAction.kind === "follow_up") {
        setActionDialog("followUp");
        return;
      }
      if (nextAction.kind === "prepare_service") {
        await confirmService(request!._id);
        toast.success("Prestation confirmée");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action impossible");
    }
  }

  const status = requestStatusConfig[request.status];
  const nextAction = getRequestNextAction(request);
  const progressIndex =
    status.category === "lost"
      ? -1
      : request.status === "accepte"
        ? activeRequestStatuses.length
        : activeRequestStatuses.indexOf(request.status);
  const eventCards = [
    ["Type", request.eventType || "À préciser"],
    [
      "Date",
      request.eventDate ? dateFormat.format(request.eventDate) : "À confirmer",
    ],
    [
      "Convives",
      request.guestCount ? `${request.guestCount} personnes` : "À préciser",
    ],
    [
      "Budget",
      request.budgetCents
        ? `${(request.budgetCents / 100).toLocaleString("fr-FR")} € TTC`
        : "À confirmer",
    ],
    ["Lieu", request.eventAddress || "Adresse à confirmer"],
    [
      "Horaire",
      request.eventStartTime && request.eventEndTime
        ? `${request.eventStartTime} – ${request.eventEndTime}`
        : "À confirmer",
    ],
  ];
  return (
    <div className="space-y-5">
      <Link
        to="/requests"
        className="inline-flex items-center gap-1 text-sm font-bold text-[#8b1629]"
      >
        <ChevronLeft className="size-4" />
        Retour aux demandes
      </Link>
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold tracking-[.14em] text-[#7d6f67] uppercase">
              Dossier · reçu le {timeFormat.format(request.createdAt)}
            </p>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${status.badgeClassName}`}
            >
              {status.label}
            </span>
          </div>
          <h1 className="mt-1 font-serif text-4xl font-bold">
            {request.eventType ||
              request.organizationName ||
              request.contactName}
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            Demande reçue de {request.contactName}
            {request.organizationName ? ` · ${request.organizationName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={async () => { if (request.archivedAt) { await restoreRequest(request._id); toast.success("Dossier désarchivé"); } else if (nextAction.kind === "archive") { await archiveRequest(request._id); toast.success("Dossier archivé"); } else { await runPrimaryAction(); } }} className="inline-flex items-center gap-2 rounded-md bg-[#650d1c] px-4 py-2 text-sm font-bold text-white">
            {nextAction.kind === "archive" ? <Archive className="size-4" /> : <Clipboard className="size-4" />}
            {request.archivedAt ? "Désarchiver le dossier" : nextAction.title}
          </button>
          <details className="relative">
            <summary className="cursor-pointer rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-700">Actions</summary>
            <div className="absolute right-0 z-20 mt-2 grid min-w-56 gap-1 rounded-lg border border-stone-200 bg-white p-2 shadow-lg">
              <button onClick={() => setMessageOpen(true)} className="rounded px-3 py-2 text-left text-sm font-semibold hover:bg-stone-50">Préparer un e-mail</button>
              {request.status === "relance" && getAllowedRequestStatuses(request.status).includes("devis_envoye") ? <button onClick={() => void changeStatus("devis_envoye")} className="rounded px-3 py-2 text-left text-sm font-semibold hover:bg-stone-50">Revenir au devis envoyé</button> : null}
              {!request.archivedAt && getAllowedRequestStatuses(request.status).includes("refuse") ? <button onClick={() => setActionDialog("refuse")} className="rounded px-3 py-2 text-left text-sm font-semibold hover:bg-stone-50">Refuser la demande</button> : null}
              {!request.archivedAt && getAllowedRequestStatuses(request.status).includes("annule") ? <button onClick={() => setActionDialog("annule")} className="rounded px-3 py-2 text-left text-sm font-semibold hover:bg-stone-50">Annuler la demande</button> : null}
              {!request.archivedAt ? <button onClick={async () => { await archiveRequest(request._id); toast.success("Dossier archivé"); }} className="rounded px-3 py-2 text-left text-sm font-semibold text-stone-600 hover:bg-stone-50">Archiver le dossier</button> : <button onClick={async () => { await restoreRequest(request._id); toast.success("Dossier désarchivé"); }} className="rounded px-3 py-2 text-left text-sm font-semibold hover:bg-stone-50">Désarchiver le dossier</button>}
              <label className="mt-1 border-t border-stone-100 px-3 pt-2 text-xs font-semibold text-stone-500">Statut (secours)<select value={request.status} onChange={(e) => void changeStatus(e.target.value as RequestStatus)} className="mt-1 w-full rounded border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-700">{getAllowedRequestStatuses(request.status).map((value) => <option key={value} value={value}>{requestStatusConfig[value].label}</option>)}</select></label>
            </div>
          </details>
        </div>
      </section>
      <section className="rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
        <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold text-stone-400 sm:grid-cols-6">
          {activeRequestStatuses.map((step, index) => (
            <div
              key={step}
              className={index <= progressIndex ? "text-[#8b1629]" : ""}
            >
              <span className="mx-auto mb-1 block size-2 rounded-full bg-current" />
              {requestStatusConfig[step].label}
            </div>
          ))}
        </div>
        {status.category === "lost" ? (
          <p className="mt-3 text-center text-sm font-semibold text-stone-600">
            Dossier {status.label.toLowerCase()} : le pipeline commercial est
            arrêté.
          </p>
        ) : null}
      </section>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(17rem,.7fr)]">
        <main className="space-y-5">
          <QuoteSummaryCard
            quote={quoteRecord}
            onOpen={() => navigate({ to: "/requests/$requestId/quote", params: { requestId: request._id } })}
            onCreateVersion={async () => {
              if (!quoteRecord) { await quote(); return; }
              const current = quoteRecord.versions.find((item) => item.id === quoteRecord.currentVersionId);
              if (!current) return;
              await createQuoteVersion(request._id, legacyQuoteFromVersion(current, quoteRecord.versions, quoteRecord.quoteNumber));
              toast.success("Nouvelle version créée");
              navigate({ to: "/requests/$requestId/quote", params: { requestId: request._id } });
            }}
          />
          <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-serif text-2xl font-bold">
                  Informations de l’événement
                </h2>
                <p className="text-xs text-stone-500">
                  Les éléments essentiels du dossier
                </p>
              </div>
              <button
                onClick={() => setEditing(true)}
                className="text-sm font-bold text-[#8b1629]"
              >
                Modifier →
              </button>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {eventCards.map(([label, value]) => (
                <div key={label} className="rounded-lg bg-[#fffaf4] p-3">
                  <p className="text-[10px] font-bold tracking-wide text-stone-400 uppercase">
                    {label}
                  </p>
                  <p className="mt-1 text-sm font-bold">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg bg-[#fff8ef] p-3 text-sm text-stone-600">
              {request.message || "Aucun message original n’a été enregistré."}
              <button
                onClick={copyMessage}
                disabled={!request.message}
                className="ml-2 font-bold text-[#8b1629] disabled:text-stone-300"
              >
                Copier
              </button>
            </div>
          </section>
          <QualificationCard
            criteria={qualification}
            onEdit={() => setEditing(true)}
            onPrepareMessage={() => setMessageOpen(true)}
          />
          <RequestInformation
            editing={editing}
            form={form}
            setForm={setForm}
            onSave={save}
            onCancel={() => {
              setForm(toForm(request));
              setEditing(false);
            }}
          />
          <History request={request} />
        </main>
        <aside className="space-y-5">
          <section className="rounded-xl bg-[#650d1c] p-5 text-white shadow-sm">
            <p className="text-xs font-bold tracking-[.14em] text-white/60 uppercase">
              Prochaine action
            </p>
            <h2 className="mt-2 font-serif text-2xl font-bold">{nextAction.title}</h2>
            <p className="mt-2 text-sm text-white/70">{nextAction.description}</p>
            {nextAction.kind === "contact" ? (
              <button onClick={() => setMessageOpen(true)} className="mt-5 w-full rounded-md bg-white px-3 py-2 text-sm font-bold text-[#650d1c]">
                Préparer le message
              </button>
            ) : nextAction.kind === "quote" ? (
              <button onClick={quote} className="mt-5 w-full rounded-md bg-white px-3 py-2 text-sm font-bold text-[#650d1c]">
                Préparer le devis
              </button>
            ) : (
              <button
                onClick={() => markHandled(request._id)}
                disabled={Boolean(request.handledAt)}
                className="mt-5 w-full rounded-md bg-white px-3 py-2 text-sm font-bold text-[#650d1c] disabled:opacity-60"
              >
                {request.handledAt ? "✓ Action traitée" : "✓ Marquer comme effectuée"}
              </button>
            )}
          </section>
          <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex justify-between">
              <h2 className="font-serif text-xl font-bold">Contact et CRM</h2>
              <span className="text-xs font-bold text-[#8b1629]">
                {sourceLabels[request.source]}
              </span>
            </div>
            <div className="mt-4 rounded-lg bg-[#fffaf4] p-3">
              <p className="font-bold">{request.contactName}</p>
              <p className="text-xs text-stone-500">
                {request.organizationName || "Nouveau contact"}
              </p>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-stone-500">E-mail</dt>
                <dd className="break-all font-semibold">
                  {request.contactEmail || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-stone-500">Téléphone</dt>
                <dd className="font-semibold">{request.contactPhone || "—"}</dd>
              </div>
            </dl>
          </section>
          {missingCriteria.length > 0 && (
            <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="font-serif text-xl font-bold">
                Informations manquantes
              </h2>
              <div className="mt-3 space-y-2">
              {missingCriteria.map((criterion) => (
                <p
                  key={criterion.id}
                  className="rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950"
                >
                  {criterion.label}
                  </p>
                ))}
              </div>
              <button
                onClick={() => setMessageOpen(true)}
                className="mt-4 text-sm font-bold text-[#8b1629]"
              >
                Demander les informations →
              </button>
            </section>
          )}
          <Notes
            request={request}
            note={note}
            setNote={setNote}
            onAdd={async () => {
              if (!note.trim()) return;
              await addNote(request._id, note.trim());
              setNote("");
              toast.success("Note ajoutée");
            }}
          />
        </aside>
      </div>
      {request.followUps.length > 0 ? (
        <FollowUps
          request={request}
          onComplete={async (followUpId) => {
            await completeFollowUp(request._id, followUpId);
            toast.success("Relance marquée comme effectuée");
          }}
        />
      ) : null}
      {messageOpen && (
        <MessageModal
          initial={draftMessage}
          onClose={() => setMessageOpen(false)}
        />
      )}
      {actionDialog && <ActionDialog kind={actionDialog} onClose={() => setActionDialog(null)} onSubmit={async (value) => { try { if (actionDialog === "followUp") { const dueAt = new Date(`${value}T12:00:00`).getTime(); if (Number.isNaN(dueAt)) throw new Error("Choisissez une date de relance."); await scheduleFollowUp(request._id, dueAt); toast.success("Relance programmée"); } else { await closeRequest(request._id, actionDialog, value); toast.success(actionDialog === "refuse" ? "Demande refusée" : "Demande annulée"); } setActionDialog(null); } catch (error) { toast.error(error instanceof Error ? error.message : "Action impossible"); } }} />}
    </div>
  );
}

function QualificationCard({
  criteria,
  onEdit,
  onPrepareMessage,
}: {
  criteria: QualificationCriterion[];
  onEdit: () => void;
  onPrepareMessage: () => void;
}) {
  const completed = criteria.filter((criterion) => criterion.complete);
  const missing = criteria.filter((criterion) => !criterion.complete);
  const progress = Math.round((completed.length / criteria.length) * 100);

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-bold">Qualification de la demande</h2>
          <p className="text-xs text-stone-500">Les informations nécessaires avant de préparer le devis.</p>
        </div>
        <span className="rounded-full bg-[#f5ecee] px-3 py-1 text-xs font-bold text-[#8b1629]">{completed.length} sur {criteria.length} complètes</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-100" aria-label={`${completed.length} informations complètes sur ${criteria.length}`} role="progressbar" aria-valuemin={0} aria-valuemax={criteria.length} aria-valuenow={completed.length}>
        <div className={`h-full rounded-full ${missing.length === 0 ? "bg-emerald-600" : "bg-[#8b1629]"}`} style={{ width: `${progress}%` }} />
      </div>
      <p className={`mt-3 text-sm font-semibold ${missing.length === 0 ? "text-emerald-700" : "text-amber-800"}`}>
        {missing.length === 0 ? "Demande suffisamment qualifiée — le devis peut être préparé." : `Demande incomplète — ${missing.length} information${missing.length > 1 ? "s" : ""} à demander au client.`}
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-xs font-bold tracking-wide text-emerald-700 uppercase">Informations complètes</h3>
          <div className="mt-2 space-y-2">{completed.map((criterion) => <p key={criterion.id} className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-950"><Check className="size-4 shrink-0 text-emerald-700" />{criterion.label}</p>)}</div>
        </div>
        <div>
          <h3 className="text-xs font-bold tracking-wide text-amber-800 uppercase">Informations manquantes</h3>
          <div className="mt-2 space-y-2">{missing.length === 0 ? <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-500">Aucune information manquante.</p> : missing.map((criterion) => <p key={criterion.id} className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">{criterion.label}</p>)}</div>
        </div>
      </div>
      {missing.length > 0 ? <div className="mt-5 flex flex-wrap gap-2"><button onClick={onEdit} className="rounded-md border border-[#d9b8bf] bg-white px-3 py-2 text-sm font-bold text-[#8b1629]">Modifier les informations</button><button onClick={onPrepareMessage} className="rounded-md bg-[#650d1c] px-3 py-2 text-sm font-bold text-white">Préparer le message</button></div> : null}
    </section>
  );
}

function QuoteSummaryCard({
  quote,
  onOpen,
  onCreateVersion,
}: {
  quote?: Quote;
  onOpen: () => void;
  onCreateVersion: () => Promise<void>;
}) {
  if (!quote) {
    return <section className="rounded-xl border border-dashed border-stone-300 bg-white p-5 shadow-sm"><h2 className="font-serif text-2xl font-bold">Devis</h2><p className="mt-2 text-sm text-stone-500">Aucun devis n’est encore lié à ce dossier.</p><button onClick={() => void onCreateVersion()} className="mt-4 rounded-md bg-[#650d1c] px-3 py-2 text-sm font-bold text-white">Créer le devis</button></section>;
  }
  const current = quote.versions.find((item) => item.id === quote.currentVersionId);
  const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  return <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold tracking-[.14em] text-[#7d6f67] uppercase">Devis</p><h2 className="mt-1 font-serif text-2xl font-bold">{quote.quoteNumber}</h2><p className="mt-1 text-sm text-stone-500">Version {current?.versionNumber ?? "—"} · {quote.status}</p></div><strong className="font-serif text-xl text-[#650d1c]">{(quote.totalTtcCents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</strong></div><dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-stone-500">Créé le</dt><dd className="font-semibold">{date.format(quote.createdAt)}</dd></div><div><dt className="text-stone-500">Dernière modification</dt><dd className="font-semibold">{date.format(quote.updatedAt)}</dd></div>{quote.sentAt ? <div><dt className="text-stone-500">Envoyé le</dt><dd className="font-semibold">{date.format(quote.sentAt)}</dd></div> : null}{current?.validUntil ? <div><dt className="text-stone-500">Valable jusqu’au</dt><dd className="font-semibold">{date.format(current.validUntil)}</dd></div> : null}</dl><div className="mt-5 flex flex-wrap gap-2"><button onClick={onOpen} className="rounded-md bg-[#650d1c] px-3 py-2 text-sm font-bold text-white">Voir le devis</button><button onClick={onOpen} className="rounded-md border border-stone-200 px-3 py-2 text-sm font-bold">Modifier</button><button onClick={() => void onCreateVersion()} className="rounded-md border border-[#8b1629] px-3 py-2 text-sm font-bold text-[#8b1629]">Créer une nouvelle version</button><button onClick={onOpen} className="rounded-md border border-stone-200 px-3 py-2 text-sm font-bold">Voir les versions ({quote.versions.length})</button></div></section>;
}

function RequestInformation({
  editing,
  form,
  setForm,
  onSave,
  onCancel,
}: {
  editing: boolean;
  form: Record<string, string>;
  setForm: (next: Record<string, string>) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const [localEditing, setLocalEditing] = useState(false);
  const isEditing = editing || localEditing;
  const field = (name: string, label: string, type = "text") => (
    <label className="grid gap-1 text-sm font-semibold">
      <span>{label}</span>
      <input
        disabled={!isEditing}
        type={type}
        value={form[name] ?? ""}
        onChange={(e) => setForm({ ...form, [name]: e.target.value })}
        className="input disabled:border-transparent disabled:bg-stone-50 disabled:text-stone-700"
      />
    </label>
  );
  return (
    <form
      onSubmit={(event) => {
        setLocalEditing(false);
        onSave(event);
      }}
      className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl font-bold">
            Informations du dossier
          </h2>
          <p className="mt-1 text-xs text-stone-500">
            Coordonnées, événement et besoins
          </p>
        </div>
        {isEditing ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setLocalEditing(false);
                onCancel();
              }}
              className="px-3 py-2 text-sm font-bold"
            >
              Annuler
            </button>
            <button className="inline-flex items-center gap-1 rounded-md bg-[#650d1c] px-3 py-2 text-sm font-bold text-white">
              <Save className="size-4" />
              Sauvegarder
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setLocalEditing(true)}
            className="rounded-md border border-[#d9b8bf] bg-white px-3 py-2 text-sm font-bold text-[#8b1629]"
          >
            Modifier
          </button>
        )}
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {field("organizationName", "Client ou entreprise")}
        {field("contactName", "Nom du contact")}
        {field("contactEmail", "E-mail", "email")}
        {field("contactPhone", "Téléphone", "tel")}
        {field("eventType", "Type d’événement")}
        {field("eventDate", "Date", "date")}
        {field("eventStartTime", "Horaire de début", "time")}
        {field("eventEndTime", "Horaire de fin", "time")}
        {field("eventAddress", "Adresse")}
        {field("guestCount", "Nombre de convives", "number")}
        {field("budgetCents", "Budget total (€)", "number")}
        {field("budgetPerPersonCents", "Budget par personne (€)", "number")}
      </div>
      <div className="mt-4 grid gap-4">
        {["specialNeeds", "dietaryRequirements", "staffingNeeds"].map(
          (name) => (
            <label key={name} className="grid gap-1 text-sm font-semibold">
              <span>
                {
                  {
                    specialNeeds: "Besoins particuliers",
                    dietaryRequirements: "Allergies et régimes alimentaires",
                    staffingNeeds: "Matériel ou personnel nécessaire",
                  }[name]
                }
              </span>
              <textarea
                disabled={!isEditing}
                value={form[name] ?? ""}
                onChange={(e) => setForm({ ...form, [name]: e.target.value })}
                className="input min-h-20 disabled:border-transparent disabled:bg-stone-50 disabled:text-stone-700"
              />
            </label>
          ),
        )}
      </div>
    </form>
  );
}
function Notes({
  request,
  note,
  setNote,
  onAdd,
}: {
  request: LocalRequest;
  note: string;
  setNote: (value: string) => void;
  onAdd: () => void;
}) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="font-serif text-xl font-bold">Notes internes</h2>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Ajouter une note pour l’équipe…"
        className="input mt-3 min-h-24"
      />
      <button
        onClick={onAdd}
        className="mt-2 inline-flex items-center gap-1 rounded-md bg-[#650d1c] px-3 py-2 text-sm font-bold text-white"
      >
        <MessageSquare className="size-4" />
        Ajouter la note
      </button>
      <div className="mt-5 space-y-3">
        {request.notes.length === 0 ? (
          <p className="text-sm text-stone-500">Aucune note interne.</p>
        ) : (
          request.notes
            .slice()
            .reverse()
            .map((item) => (
              <div key={item.id} className="rounded-lg bg-stone-50 p-3">
                <p className="whitespace-pre-wrap text-sm">{item.content}</p>
                <time className="mt-2 block text-xs text-stone-400">
                  {timeFormat.format(item.createdAt)}
                </time>
              </div>
            ))
        )}
      </div>
    </section>
  );
}
function History({ request }: { request: LocalRequest }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="font-serif text-xl font-bold">Historique</h2>
      <ol className="mt-4 space-y-4 border-l border-[#d9c7cb] pl-4">
        {request.history
          .slice()
          .reverse()
          .map((item) => (
            <li
              key={item.id}
              className="relative text-sm before:absolute before:-left-[21px] before:top-1 before:size-2 before:rounded-full before:bg-[#8b1629]"
            >
              <p className="font-semibold">{item.label}</p>
              <time className="text-xs text-stone-400">
                {timeFormat.format(item.createdAt)}
              </time>
            </li>
          ))}
      </ol>
    </section>
  );
}
function ActionDialog({ kind, onClose, onSubmit }: { kind: "followUp" | "refuse" | "annule"; onClose: () => void; onSubmit: (value: string) => Promise<void> }) {
  const [value, setValue] = useState("");
  const isFollowUp = kind === "followUp";
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"><section role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"><h2 className="font-serif text-2xl font-bold">{isFollowUp ? "Programmer une relance" : kind === "refuse" ? "Refuser la demande" : "Annuler la demande"}</h2><p className="mt-1 text-sm text-stone-500">{isFollowUp ? "Choisissez la date de la prochaine action commerciale." : "Indiquez le motif afin de le conserver dans l’historique du dossier."}</p><label className="mt-4 grid gap-1 text-sm font-semibold">{isFollowUp ? "Date de relance" : "Motif"}{isFollowUp ? <input autoFocus type="date" value={value} onChange={(event) => setValue(event.target.value)} className="input" /> : <textarea autoFocus value={value} onChange={(event) => setValue(event.target.value)} className="input min-h-28" />}</label><div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="px-3 py-2 text-sm font-bold">Annuler</button><button disabled={!value.trim()} onClick={() => void onSubmit(value)} className="rounded-md bg-[#650d1c] px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{isFollowUp ? "Programmer" : "Confirmer"}</button></div></section></div>;
}

function MessageModal({
  initial,
  onClose,
}: {
  initial: string;
  onClose: () => void;
}) {
  const [message, setMessage] = useState(initial);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <section
        role="dialog"
        aria-modal="true"
        className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 className="font-serif text-2xl font-bold">
          Demander les informations manquantes
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Le message est prêt à être copié, aucun e-mail ne sera envoyé.
        </p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="input mt-4 min-h-48"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm font-bold">
            Fermer
          </button>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(message);
              toast.success("Message copié");
            }}
            className="rounded-md bg-[#650d1c] px-3 py-2 text-sm font-bold text-white"
          >
            Copier le message
          </button>
        </div>
      </section>
    </div>
  );
}
function EmptyRequest() {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-8">
      <h1 className="font-serif text-3xl font-bold">Dossier introuvable</h1>
      <Link
        to="/requests"
        className="mt-4 inline-block font-bold text-[#8b1629]"
      >
        Retour aux demandes
      </Link>
    </div>
  );
}
function toForm(request: LocalRequest) {
  return {
    organizationName: request.organizationName ?? "",
    contactName: request.contactName,
    contactEmail: request.contactEmail ?? "",
    contactPhone: request.contactPhone ?? "",
    eventType: request.eventType ?? "",
    eventDate: request.eventDate
      ? new Date(request.eventDate).toISOString().slice(0, 10)
      : "",
    eventStartTime: request.eventStartTime ?? "",
    eventEndTime: request.eventEndTime ?? "",
    eventAddress: request.eventAddress ?? "",
    guestCount: request.guestCount?.toString() ?? "",
    budgetCents: request.budgetCents
      ? (request.budgetCents / 100).toString()
      : "",
    budgetPerPersonCents: request.budgetPerPersonCents
      ? (request.budgetPerPersonCents / 100).toString()
      : "",
    specialNeeds: request.specialNeeds ?? "",
    dietaryRequirements: request.dietaryRequirements ?? "",
    staffingNeeds: request.staffingNeeds ?? "",
  };
}
function fromForm(form: Record<string, string>) {
  const empty = (key: string) => form[key]?.trim() || undefined;
  const money = (key: string) =>
    form[key] ? Math.round(Number(form[key]) * 100) : undefined;
  return {
    organizationName: empty("organizationName"),
    contactName: empty("contactName") || "Contact à identifier",
    contactEmail: empty("contactEmail"),
    contactPhone: empty("contactPhone"),
    eventType: empty("eventType"),
    eventDate: form.eventDate
      ? new Date(`${form.eventDate}T12:00:00`).getTime()
      : undefined,
    eventStartTime: empty("eventStartTime"),
    eventEndTime: empty("eventEndTime"),
    eventAddress: empty("eventAddress"),
    guestCount: form.guestCount ? Number(form.guestCount) : undefined,
    budgetCents: money("budgetCents"),
    budgetPerPersonCents: money("budgetPerPersonCents"),
    specialNeeds: empty("specialNeeds"),
    dietaryRequirements: empty("dietaryRequirements"),
    staffingNeeds: empty("staffingNeeds"),
  };
}
