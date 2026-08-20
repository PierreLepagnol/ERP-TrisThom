import {
  Link,
  Outlet,
  createFileRoute,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { Archive, Check, ChevronLeft, Clipboard, MessageSquare, MoreHorizontal, Save } from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { api } from "@ERPTrisThom/backend/convex/_generated/api";
import type { Id } from "@ERPTrisThom/backend/convex/_generated/dataModel";

import { activeRequestStatuses, getAllowedRequestStatuses, requestStatusConfig, requestStatusValues, type RequestStatus } from "@/domain/request-status";
import { getRequestQualification, type QualificationCriterion } from "@/domain/request-qualification";
import { latestRequestNote, requestPrimaryAction, requestQuoteSummary, type RequestDetailTab } from "@/domain/request-detail";
import { useConvexCrm } from "@/lib/convex-crm";
import { legacyQuoteFromVersion, type LocalRequest, type Quote } from "@/lib/local-crm";

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
    reopenCancelledRequest,
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
    deleteRequest,
    completeFollowUp,
    createQuoteVersion,
  } = useConvexCrm();
  const foundRequest = [...requests, ...archivedRequests].find(
    (item) => item._id === requestId,
  );
  const emailMessages = useQuery(
    api.customerEmailData.listForRequest,
    foundRequest ? { requestId: foundRequest._id as Id<"requests"> } : "skip",
  );
  const sendEmail = useAction(api.customerEmail.send);
  const emailTemplates = useQuery(api.emailTemplates.list);
  const saveEmailTemplate = useMutation(api.emailTemplates.save);
  const quoteRecord = quotes.find((item) => item.requestId === requestId);
  const [messageOpen, setMessageOpen] = useState(false);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [actionDialog, setActionDialog] = useState<
    "followUp" | "refuse" | "annule" | null
  >(null);
  const [reopenDialog, setReopenDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<RequestDetailTab>("resume");

  useEffect(() => {
    if (foundRequest) setForm(toForm(foundRequest));
  }, [foundRequest]);
  const qualification = useMemo(
    () => (foundRequest ? getRequestQualification(foundRequest) : []),
    [foundRequest],
  );
  const missingCriteria = qualification.filter(
    (criterion) => !criterion.complete,
  );
  const draftMessage = useMemo(
    () =>
      foundRequest
        ? `Bonjour ${foundRequest.contactName},\n\nPour pouvoir préparer votre devis, pourriez-vous nous préciser : ${missingCriteria.map((criterion) => criterion.label).join(", ") || "les derniers éléments de votre demande"} ?\n\nMerci et à bientôt,\nBouillon Comptoir`
        : "",
    [missingCriteria, foundRequest],
  );
  if (location.pathname.endsWith("/quote")) return <Outlet />;
  if (!foundRequest) return <EmptyRequest />;
  const request = foundRequest;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await updateRequest(request!._id, fromForm(form));
    setEditing(false);
    toast.success("Dossier enregistré localement");
  }
  async function changeStatus(status: RequestStatus) {
    await updateStatus({ requestId: request!._id, status, eventStartTime: request!.eventStartTime, eventEndTime: request!.eventEndTime });
  }
  async function copyMessage() {
    await navigator.clipboard.writeText(request!.message ?? "");
    toast.success("Message copié");
  }
  async function quote() {
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

  const nextAction = requestPrimaryAction(request);
  const status = requestStatusConfig[request.status];
  const quoteSummary = requestQuoteSummary(quoteRecord);
  const latestNote = latestRequestNote(request);
  const progressIndex = status.category === "lost" ? -1 : request.status === "accepte" ? activeRequestStatuses.length : activeRequestStatuses.indexOf(request.status);
  const eventCards = [["Besoins particuliers", request.specialNeeds || "Aucun besoin particulier renseigné"], ["Contraintes alimentaires", request.dietaryRequirements || "Aucune contrainte renseignée"], ["Personnel / matériel", request.staffingNeeds || "Aucun besoin renseigné"]];
  return (
    <div className="space-y-6">
      <Link to="/requests" className="inline-flex items-center gap-1 text-sm font-bold text-[#8b1629]"><ChevronLeft className="size-4" />Retour aux demandes</Link>
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="flex flex-wrap items-center gap-2"><h1 className="font-serif text-4xl font-bold">{request.contactName}</h1><span className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${status.badgeClassName}`}>{status.label}</span></div><p className="mt-2 text-sm text-stone-600">{request.eventType || "Événement à préciser"} · {request.eventDate ? dateFormat.format(request.eventDate) : "date à préciser"} · {request.guestCount ? `${request.guestCount} personnes` : "nombre de personnes à préciser"}</p><p className="mt-1 text-sm text-stone-500">{request.eventAddress || request.venue || "Adresse à préciser"}</p></div>
        <details className="relative"><summary aria-label="Autres actions" className="list-none cursor-pointer rounded-md border border-stone-200 bg-white p-2 text-stone-700"><MoreHorizontal className="size-5" /></summary><div className="absolute right-0 z-20 mt-2 grid min-w-48 gap-1 rounded-lg border border-stone-200 bg-white p-2 shadow-lg"><button onClick={() => setEditing(true)} className="rounded px-3 py-2 text-left text-sm font-semibold hover:bg-stone-50">Modifier</button><button onClick={() => setActionDialog("refuse")} className="rounded px-3 py-2 text-left text-sm font-semibold hover:bg-stone-50">Marquer comme perdu</button><button onClick={() => setActionDialog("annule")} className="rounded px-3 py-2 text-left text-sm font-semibold hover:bg-stone-50">Annuler</button><button onClick={() => setDeleteDialog(true)} className="rounded px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50">Supprimer</button></div></details>
      </section>
      <section className="rounded-xl bg-[#650d1c] p-5 text-white shadow-sm"><p className="text-xs font-bold tracking-[.14em] text-white/60 uppercase">Prochaine action</p><h2 className="mt-2 font-serif text-2xl font-bold">{nextAction.title}</h2>{nextAction.description ? <p className="mt-2 text-sm text-white/70">{nextAction.description}</p> : null}<button onClick={() => void runPrimaryAction()} className="mt-5 rounded-md bg-white px-4 py-2 text-sm font-bold text-[#650d1c]">{nextAction.kind === "contact" ? "Préparer le message" : nextAction.kind === "quote" || nextAction.kind === "review_quote" ? "Ouvrir le devis" : "Faire cette action"}</button></section>
      <nav aria-label="Sections du dossier" className="flex gap-1 overflow-x-auto border-b border-stone-200">{([ ["resume", "Demande"], ["echanges", "Conversation"], ["devis", "Devis"] ] as const).map(([tab, label]) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-bold ${activeTab === tab ? "border-[#8b1629] text-[#8b1629]" : "border-transparent text-stone-500"}`}>{label}</button>)}</nav>
      {activeTab === "resume" ? <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><h2 className="font-serif text-2xl font-bold">Demande</h2><button onClick={() => setEditing(true)} className="text-sm font-bold text-[#8b1629]">Modifier</button></div><dl className="mt-5 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2"><Info label="Client" value={request.organizationName || request.contactName} /><Info label="E-mail" value={request.contactEmail} /><Info label="Téléphone" value={request.contactPhone} /><Info label="Type d’événement" value={request.eventType} /><Info label="Date" value={request.eventDate ? dateFormat.format(request.eventDate) : undefined} /><Info label="Nombre de personnes" value={request.guestCount ? `${request.guestCount}` : undefined} /><Info label="Adresse" value={request.eventAddress || request.venue} /><Info label="Source" value={sourceLabels[request.source]} /></dl>{request.message ? <div className="mt-6 border-t border-stone-100 pt-5"><p className="text-xs font-bold tracking-wide text-stone-400 uppercase">Message du client</p><p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">{request.message}</p></div> : null}</section> : null}
      {activeTab === "echanges" ? <div className="space-y-5"><ChangeSuggestions requestId={request._id as Id<"requests">} /><EmailConversation messages={emailMessages ?? []} onReply={() => setMessageOpen(true)} /><Notes request={request} note={note} setNote={setNote} onAdd={async () => { if (!note.trim()) return; await addNote(request._id, note.trim()); setNote(""); toast.success("Note ajoutée"); }} /></div> : null}
      {activeTab === "devis" ? <div className="space-y-5"><QuoteSummaryCard quote={quoteRecord} onOpen={() => navigate({ to: "/requests/$requestId/quote", params: { requestId: request._id } })} onCreateVersion={async () => { if (!quoteRecord) { await quote(); return; } const current = quoteRecord.versions.find((item) => item.id === quoteRecord.currentVersionId); if (!current) return; await createQuoteVersion(request._id, legacyQuoteFromVersion(current, quoteRecord.versions, quoteRecord.quoteNumber)); toast.success("Nouvelle version créée"); navigate({ to: "/requests/$requestId/quote", params: { requestId: request._id } }); }} /><QuoteVersions quote={quoteRecord} requestId={request._id} onOpen={() => navigate({ to: "/requests/$requestId/quote", params: { requestId: request._id } })} /><RequestDocuments requestId={request._id as Id<"requests">} /></div> : null}
      {editing ? <RequestInformation form={form} setForm={setForm} onSave={save} onCancel={() => { setForm(toForm(request)); setEditing(false); }} /> : null}
      {messageOpen && <MessageModal initial={draftMessage} recipient={request.contactEmail} subject={emailSubject(emailMessages ?? [])} templates={[...builtInEmailTemplates, ...(emailTemplates ?? [])]} onClose={() => setMessageOpen(false)} onSaveTemplate={async (name, subject, body) => { await saveEmailTemplate({ name, subject, body }); toast.success("Modèle d’e-mail enregistré"); }} onSend={async (subject, body, attachments) => { if (!request.contactEmail) throw new Error("Ajoutez l’adresse e-mail du client avant d’envoyer."); const lastMessage = (emailMessages ?? []).at(-1); await sendEmail({ requestId: request._id as Id<"requests">, recipientEmail: request.contactEmail, subject, body, inReplyTo: lastMessage?.messageId, attachments }); toast.success("E-mail envoyé et ajouté au dossier"); setMessageOpen(false); }} />}
      {actionDialog && <ActionDialog kind={actionDialog} onClose={() => setActionDialog(null)} onSubmit={async (value) => { try { if (actionDialog === "followUp") { const dueAt = new Date(`${value}T12:00:00`).getTime(); if (Number.isNaN(dueAt)) throw new Error("Choisissez une date de relance."); await scheduleFollowUp(request._id, dueAt); toast.success("Relance programmée"); } else { await closeRequest(request._id, actionDialog, value); toast.success(actionDialog === "refuse" ? "Demande marquée comme perdue" : "Demande annulée"); } setActionDialog(null); } catch (error) { toast.error(error instanceof Error ? error.message : "Action impossible"); } }} />}
      {deleteDialog ? <DeleteRequestDialog request={request} onClose={() => setDeleteDialog(false)} onConfirm={async () => { try { await deleteRequest(request._id); toast.success("Demande supprimée"); await navigate({ to: "/requests" }); } catch (error) { toast.error(error instanceof Error ? error.message : "Impossible de supprimer la demande"); } }} /> : null}
    </div>
  );
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
          {request.status === "accepte" ? <Link to="/services/$requestId" params={{ requestId: request._id }} className="inline-flex items-center gap-2 rounded-md bg-[#650d1c] px-4 py-2 text-sm font-bold text-white"><Clipboard className="size-4" />Préparer la prestation</Link> : request.status === "annule" ? <button onClick={() => setReopenDialog(true)} className="inline-flex items-center gap-2 rounded-md bg-[#650d1c] px-4 py-2 text-sm font-bold text-white">Réouvrir le dossier</button> : <button onClick={async () => { if (request.archivedAt) { await restoreRequest(request._id); toast.success("Dossier désarchivé"); } else if (nextAction.kind === "archive") { await archiveRequest(request._id); toast.success("Dossier archivé"); } else { await runPrimaryAction(); } }} className="inline-flex items-center gap-2 rounded-md bg-[#650d1c] px-4 py-2 text-sm font-bold text-white">
            {nextAction.kind === "archive" ? <Archive className="size-4" /> : <Clipboard className="size-4" />}
            {request.archivedAt ? "Désarchiver le dossier" : nextAction.title}
          </button>}
          <details className="relative">
            <summary aria-label="Autres actions" className="list-none cursor-pointer rounded-md border border-stone-200 bg-white p-2 text-stone-700"><MoreHorizontal className="size-5" /></summary>
            <div className="absolute right-0 z-20 mt-2 grid min-w-56 gap-1 rounded-lg border border-stone-200 bg-white p-2 shadow-lg">
              <button onClick={() => setMessageOpen(true)} className="rounded px-3 py-2 text-left text-sm font-semibold hover:bg-stone-50">Préparer un e-mail</button>
              {request.status === "relance" && getAllowedRequestStatuses(request.status).includes("devis_envoye") ? <button onClick={() => void changeStatus("devis_envoye")} className="rounded px-3 py-2 text-left text-sm font-semibold hover:bg-stone-50">Revenir au devis envoyé</button> : null}
              {!request.archivedAt && getAllowedRequestStatuses(request.status).includes("refuse") ? <button onClick={() => setActionDialog("refuse")} className="rounded px-3 py-2 text-left text-sm font-semibold hover:bg-stone-50">Refuser la demande</button> : null}
              {!request.archivedAt && getAllowedRequestStatuses(request.status).includes("annule") ? <button onClick={() => setActionDialog("annule")} className="rounded px-3 py-2 text-left text-sm font-semibold hover:bg-stone-50">Annuler la demande</button> : null}
              {!request.archivedAt ? <button onClick={async () => { await archiveRequest(request._id); toast.success("Dossier archivé"); }} className="rounded px-3 py-2 text-left text-sm font-semibold text-stone-600 hover:bg-stone-50">Archiver le dossier</button> : <button onClick={async () => { await restoreRequest(request._id); toast.success("Dossier désarchivé"); }} className="rounded px-3 py-2 text-left text-sm font-semibold hover:bg-stone-50">Désarchiver le dossier</button>}
              <button onClick={() => setDeleteDialog(true)} className="rounded px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50">Supprimer la demande</button>
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
      <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <SummaryItem label="Date" value={request.eventDate ? dateFormat.format(request.eventDate) : "Date à confirmer"} />
          <SummaryItem label="Horaires" value={request.eventStartTime && request.eventEndTime ? `${request.eventStartTime} – ${request.eventEndTime}` : "Horaires à confirmer"} />
          <SummaryItem label="Convives" value={request.guestCount ? `${request.guestCount} personnes` : "Convives à préciser"} />
          <SummaryItem label="Lieu" value={request.eventAddress || request.venue || "Adresse à confirmer"} />
          <SummaryItem label="Budget" value={request.budgetCents !== undefined ? `${(request.budgetCents! / 100).toLocaleString("fr-FR")} € TTC` : "Budget à préciser"} />
          <SummaryItem label="Devis" value={quoteSummary.quoteNumber ? `${quoteSummary.quoteNumber} · V${quoteSummary.versionNumber ?? "—"} · ${quoteSummary.state}` : "Aucun devis"} />
          <SummaryItem label="Prochaine action" value={nextAction.title} />
        </div>
      </section>
      <nav aria-label="Sections du dossier" className="flex gap-1 overflow-x-auto border-b border-stone-200">
        {([ ["resume", "Résumé"], ["devis", "Devis"], ["echanges", "Échanges et notes"], ["historique", "Historique"] ] as const).map(([tab, label]) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-bold ${activeTab === tab ? "border-[#8b1629] text-[#8b1629]" : "border-transparent text-stone-500"}`}>{label}</button>)}
      </nav>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(17rem,.7fr)]">
        <main className="space-y-5">
          {activeTab === "devis" ? <QuoteSummaryCard
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
          /> : null}
          {activeTab === "resume" ? <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-serif text-2xl font-bold">
                  Besoins et message du client
                </h2>
                <p className="text-xs text-stone-500">
                  Les précisions utiles à la prestation
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
          </section> : null}
          {activeTab === "resume" ? <QualificationCard
            criteria={qualification}
            onEdit={() => setEditing(true)}
            onPrepareMessage={() => setMessageOpen(true)}
          /> : null}
          {activeTab === "echanges" ? <>
            <EmailConversation messages={emailMessages ?? []} />
            <Notes request={request} note={note} setNote={setNote} onAdd={async () => { if (!note.trim()) return; await addNote(request._id, note.trim()); setNote(""); toast.success("Note ajoutée"); }} />
          </> : null}
          {activeTab === "historique" ? <History request={request} /> : null}
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
                <dd className="flex min-w-0 items-center gap-2 break-all font-semibold">{request.contactEmail || "—"}{request.contactEmail ? <button type="button" onClick={() => void copyQuickContact(request.contactEmail!, "E-mail copié")} className="shrink-0 text-xs font-bold text-[#8b1629]">Copier</button> : null}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-stone-500">Téléphone</dt>
                <dd className="flex items-center gap-2 font-semibold">{request.contactPhone || "—"}{request.contactPhone ? <button type="button" onClick={() => void copyQuickContact(request.contactPhone!, "Téléphone copié")} className="text-xs font-bold text-[#8b1629]">Copier</button> : null}</dd>
              </div>
            </dl>
          </section>
          {activeTab === "resume" && missingCriteria.length > 0 && (
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
          <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3"><h2 className="font-serif text-xl font-bold">Dernière note</h2><button type="button" onClick={() => setActiveTab("echanges")} className="text-xs font-bold text-[#8b1629]">Voir toutes les notes</button></div>
            {latestNote ? <div className="mt-3 rounded-lg bg-stone-50 p-3"><p className="whitespace-pre-wrap text-sm">{latestNote.content}</p><time className="mt-2 block text-xs text-stone-400">{timeFormat.format(latestNote.createdAt)}</time></div> : <p className="mt-3 text-sm text-stone-500">Aucune note interne.</p>}
          </section>
        </aside>
      </div>
      {activeTab === "echanges" && request.followUps.length > 0 ? (
        <FollowUps
          request={request}
          onComplete={async (followUpId) => {
            await completeFollowUp(request._id, followUpId);
            toast.success("Relance marquée comme effectuée");
          }}
        />
      ) : null}
      {editing ? <RequestInformation
        form={form}
        setForm={setForm}
        onSave={save}
        onCancel={() => {
          setForm(toForm(request));
          setEditing(false);
        }}
      /> : null}
      {messageOpen && (
        <MessageModal
          initial={draftMessage}
          recipient={request.contactEmail}
          subject={emailSubject(emailMessages ?? [])}
          templates={[...builtInEmailTemplates, ...(emailTemplates ?? [])]}
          onClose={() => setMessageOpen(false)}
          onSaveTemplate={async (name, subject, body) => {
            await saveEmailTemplate({ name, subject, body });
            toast.success("Modèle d’e-mail enregistré");
          }}
          onSend={async (subject, body, attachments) => {
            if (!request.contactEmail) {
              throw new Error("Ajoutez l’adresse e-mail du client avant d’envoyer.");
            }
            const lastMessage = (emailMessages ?? []).at(-1);
            await sendEmail({
              requestId: request._id as Id<"requests">,
              recipientEmail: request.contactEmail,
              subject,
              body,
              inReplyTo: lastMessage?.messageId,
              attachments,
            });
            toast.success("E-mail envoyé et ajouté au dossier");
            setMessageOpen(false);
          }}
        />
      )}
      {actionDialog && <ActionDialog kind={actionDialog!} onClose={() => setActionDialog(null)} onSubmit={async (value) => { try { if (actionDialog === "followUp") { const dueAt = new Date(`${value}T12:00:00`).getTime(); if (Number.isNaN(dueAt)) throw new Error("Choisissez une date de relance."); await scheduleFollowUp(request._id, dueAt); toast.success("Relance programmée"); } else { await closeRequest(request._id, actionDialog!, value); toast.success(actionDialog === "refuse" ? "Demande refusée" : "Demande annulée"); } setActionDialog(null); } catch (error) { toast.error(error instanceof Error ? error.message : "Action impossible"); } }} />}
      {reopenDialog ? <ReopenDialog onClose={() => setReopenDialog(false)} onSubmit={async (status) => { await reopenCancelledRequest(request._id, status); setReopenDialog(false); toast.success("Dossier réouvert"); }} /> : null}
      {deleteDialog ? <DeleteRequestDialog request={request} onClose={() => setDeleteDialog(false)} onConfirm={async () => { try { await deleteRequest(request._id); toast.success("Demande supprimée"); await navigate({ to: "/requests" }); } catch (error) { toast.error(error instanceof Error ? error.message : "Impossible de supprimer la demande"); } }} /> : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return <div><dt className="text-stone-500">{label}</dt><dd className="mt-1 font-semibold text-stone-800">{value || "—"}</dd></div>;
}

function DeleteRequestDialog({ request, onClose, onConfirm }: { request: LocalRequest; onClose: () => void; onConfirm: () => Promise<void> }) {
  const eventDate = request.eventDate ? dateFormat.format(request.eventDate) : "date à préciser";
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"><section role="dialog" aria-modal="true" aria-labelledby="delete-request-title" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"><h2 id="delete-request-title" className="font-serif text-2xl font-bold">Supprimer la demande ?</h2><p className="mt-3 text-sm text-stone-600">Supprimer la demande de <strong>{request.contactName}</strong> du <strong>{eventDate}</strong> ?</p><p className="mt-2 text-xs text-stone-500">Elle ne sera plus affichée dans TrisThom.</p><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm font-bold text-stone-700">Annuler</button><button type="button" onClick={() => void onConfirm()} className="rounded-md bg-red-700 px-3 py-2 text-sm font-bold text-white">Supprimer</button></div></section></div>;
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-lg bg-[#fffaf4] px-3 py-2"><p className="text-[10px] font-bold tracking-wide text-stone-400 uppercase">{label}</p><p className="mt-1 truncate font-semibold" title={value}>{value}</p></div>;
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
          <h2 className="font-serif text-2xl font-bold">Informations à confirmer</h2>
          <p className="text-xs text-stone-500">Cette checklist vous aide à préparer le dossier, sans bloquer le devis.</p>
        </div>
        <span className="rounded-full bg-[#f5ecee] px-3 py-1 text-xs font-bold text-[#8b1629]">{completed.length} sur {criteria.length} complètes</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-100" aria-label={`${completed.length} informations complètes sur ${criteria.length}`} role="progressbar" aria-valuemin={0} aria-valuemax={criteria.length} aria-valuenow={completed.length}>
        <div className={`h-full rounded-full ${missing.length === 0 ? "bg-emerald-600" : "bg-[#8b1629]"}`} style={{ width: `${progress}%` }} />
      </div>
      <p className={`mt-3 text-sm font-semibold ${missing.length === 0 ? "text-emerald-700" : "text-amber-800"}`}>
        {missing.length === 0 ? "Toutes les informations principales sont renseignées." : `${missing.length} information${missing.length > 1 ? "s" : ""} à confirmer avec le client.`}
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-xs font-bold tracking-wide text-emerald-700 uppercase">Informations complètes</h3>
          <div className="mt-2 space-y-2">{completed.map((criterion) => <p key={criterion.id} className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-950"><Check className="size-4 shrink-0 text-emerald-700" />{criterion.label}</p>)}</div>
        </div>
        <div>
          <h3 className="text-xs font-bold tracking-wide text-amber-800 uppercase">À confirmer</h3>
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

function QuoteVersions({ quote, requestId, onOpen }: { quote?: Quote; requestId: string; onOpen: () => void }) {
  if (!quote?.versions.length) return null;
  const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  return <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"><h2 className="font-serif text-xl font-bold">Versions</h2><ul className="mt-4 divide-y divide-stone-100">{quote.versions.slice().sort((left, right) => right.versionNumber - left.versionNumber).map((version) => <li key={version.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold">{quote.quoteNumber} · version {version.versionNumber}</p><p className="mt-1 text-xs text-stone-500">{date.format(version.updatedAt)} · {version.status}</p></div><div className="flex gap-3 text-sm font-bold"><button type="button" onClick={onOpen} className="text-[#8b1629]">Ouvrir le devis</button><button type="button" onClick={() => window.open(`/print/requests/${requestId}/quote?version=${encodeURIComponent(version.id)}`, "_blank", "noopener,noreferrer")} className="text-[#8b1629]">Ouvrir le PDF</button></div></li>)}</ul></section>;
}

function RequestInformation({
  form,
  setForm,
  onSave,
  onCancel,
}: {
  form: Record<string, string>;
  setForm: (next: Record<string, string>) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const field = (name: string, label: string, type = "text") => (
    <label className="grid gap-1 text-sm font-semibold">
      <span>{label}</span>
      <input
        type={type}
        value={form[name] ?? ""}
        onChange={(e) => setForm({ ...form, [name]: e.target.value })}
        className="input"
      />
    </label>
  );
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-4">
    <form
      onSubmit={(event) => {
        onSave(event);
      }}
      className="mx-auto my-6 w-full max-w-3xl rounded-xl border border-stone-200 bg-white p-6 shadow-xl"
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
        <div className="flex gap-2"><button type="button" onClick={onCancel} className="px-3 py-2 text-sm font-bold">Annuler</button><button className="inline-flex items-center gap-1 rounded-md bg-[#650d1c] px-3 py-2 text-sm font-bold text-white"><Save className="size-4" />Enregistrer les modifications</button></div>
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
                value={form[name] ?? ""}
                onChange={(e) => setForm({ ...form, [name]: e.target.value })}
                className="input min-h-20"
              />
            </label>
          ),
        )}
      </div>
    </form>
    </div>
  );
}

type EmailMessage = {
  _id: string;
  direction: "inbound" | "outbound";
  messageId: string;
  subject?: string;
  body: string;
  senderEmail?: string;
  recipientEmail?: string;
  attachmentNames?: string[];
  sentAt: number;
};

type EmailTemplate = {
  _id: string;
  name: string;
  subject: string;
  body: string;
};

const builtInEmailTemplates: EmailTemplate[] = [
  {
    _id: "builtin-missing-information",
    name: "Demander les informations manquantes",
    subject: "Quelques précisions pour votre devis",
    body: "Bonjour,\n\nAfin de préparer votre devis au plus juste, pourriez-vous nous transmettre les quelques précisions manquantes concernant votre demande ?\n\nMerci et à bientôt,\nBouillon Comptoir",
  },
  {
    _id: "builtin-quote-sent",
    name: "Accompagner l’envoi d’un devis",
    subject: "Votre devis Bouillon Comptoir",
    body: "Bonjour,\n\nVous trouverez ci-joint notre proposition pour votre événement. Nous restons à votre disposition pour toute question ou ajustement.\n\nBien cordialement,\nBouillon Comptoir",
  },
  {
    _id: "builtin-follow-up",
    name: "Relancer un devis",
    subject: "Avez-vous pu consulter notre proposition ?",
    body: "Bonjour,\n\nNous nous permettons de revenir vers vous afin de savoir si vous avez pu consulter notre proposition. Nous restons disponibles pour l’adapter à vos besoins.\n\nBien cordialement,\nBouillon Comptoir",
  },
];

function emailSubject(messages: EmailMessage[]) {
  const latestSubject = messages.at(-1)?.subject?.trim();
  if (!latestSubject) return "Votre demande — Bouillon Comptoir";
  return /^re:/i.test(latestSubject) ? latestSubject : `Re: ${latestSubject}`;
}

function ChangeSuggestions({ requestId }: { requestId: Id<"requests"> }) {
  const suggestions = useQuery(api.requestReview.listPending, { requestId });
  const decide = useMutation(api.requestReview.decide);
  if (!suggestions?.length) return null;
  return <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-5"><h2 className="font-serif text-xl font-bold">Modifications détectées</h2><div className="mt-4 space-y-3">{suggestions.map((suggestion) => <div key={suggestion._id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3"><p className="text-sm"><strong>{suggestionLabel(suggestion.field)}</strong> : {suggestion.currentValue || "—"} → {suggestion.proposedValue}</p><div className="flex gap-2"><button type="button" onClick={() => void decide({ suggestionId: suggestion._id, decision: "apply" })} className="rounded-md bg-[#650d1c] px-3 py-2 text-xs font-bold text-white">Appliquer</button><button type="button" onClick={() => void decide({ suggestionId: suggestion._id, decision: "ignore" })} className="rounded-md border border-stone-200 px-3 py-2 text-xs font-bold">Ignorer</button></div></div>)}</div></section>;
}

function RequestDocuments({ requestId }: { requestId: Id<"requests"> }) {
  const documents = useQuery(api.requestDocuments.list, { requestId });
  const generateUploadUrl = useMutation(api.requestDocuments.generateUploadUrl);
  const save = useMutation(api.requestDocuments.save);
  const remove = useMutation(api.requestDocuments.remove);
  const [uploading, setUploading] = useState(false);
  async function upload(file: File) {
    if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) return toast.error("Choisissez un PDF.");
    if (file.size > 5 * 1024 * 1024) return toast.error("Le PDF doit faire moins de 5 Mo.");
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!response.ok) throw new Error("Import impossible.");
      const { storageId } = await response.json() as { storageId: Id<"_storage"> };
      await save({ requestId, storageId, filename: file.name, sizeBytes: file.size });
      toast.success("PDF ajouté au dossier");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Import impossible."); } finally { setUploading(false); }
  }
  return <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-serif text-xl font-bold">Documents</h2><p className="mt-1 text-sm text-stone-500">PDF ajoutés au dossier.</p></div><label className="cursor-pointer rounded-md border border-[#d9b8bf] px-3 py-2 text-sm font-bold text-[#8b1629]">{uploading ? "Ajout…" : "Ajouter un PDF"}<input type="file" accept="application/pdf,.pdf" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} className="sr-only" /></label></div>{documents?.length ? <ul className="mt-4 divide-y divide-stone-100">{documents.map((document) => <li key={document._id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold">{document.filename}</p><p className="mt-1 text-xs text-stone-500">{new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(document.createdAt)}</p></div><div className="flex gap-3 text-sm font-bold"><a href={document.url ?? undefined} target="_blank" rel="noreferrer" className="text-[#8b1629]">Ouvrir</a><button type="button" onClick={() => { if (window.confirm(`Supprimer ${document.filename} ?`)) void remove({ documentId: document._id }); }} className="text-red-700">Supprimer</button></div></li>)}</ul> : <p className="mt-4 text-sm text-stone-500">Aucun document ajouté.</p>}</section>;
}

function suggestionLabel(field: string) {
  return ({ guestCount: "Nombre de personnes", eventAddress: "Adresse", eventDate: "Date", eventType: "Type d’événement", eventStartTime: "Horaire", budgetCents: "Budget", budgetPerPersonCents: "Budget par personne", specialNeeds: "Besoins particuliers", contactName: "Contact", contactPhone: "Téléphone", organizationName: "Organisation" }[field] ?? field);
}

function EmailConversation({ messages, onReply }: { messages: EmailMessage[]; onReply?: () => void }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[.14em] text-[#7d6f67] uppercase">E-mails</p>
          <h2 className="mt-1 font-serif text-xl font-bold">Conversation avec le client</h2>
        </div>
        {onReply ? <button type="button" onClick={onReply} className="rounded-md border border-[#d9b8bf] px-3 py-2 text-sm font-bold text-[#8b1629]">Répondre</button> : <span className="text-sm text-stone-500">{messages.length} message{messages.length > 1 ? "s" : ""}</span>}
      </div>
      {messages.length === 0 ? (
        <p className="mt-4 rounded-lg bg-stone-50 p-4 text-sm text-stone-500">
          Les prochains e-mails reçus et envoyés depuis ce dossier apparaîtront ici.
        </p>
      ) : (
        <ol className="mt-4 space-y-3">
          {messages.map((message) => {
            const outbound = message.direction === "outbound";
            return <li key={message._id} className={`rounded-lg p-4 ${outbound ? "ml-6 bg-[#f9ecee]" : "mr-6 bg-stone-50"}`}>
              <div className="flex flex-wrap justify-between gap-2 text-xs">
                <p className="font-bold text-[#650d1c]">{outbound ? "Sortant · vous" : `Entrant · ${message.senderEmail || "client"}`}</p>
                <time className="text-stone-500">{timeFormat.format(message.sentAt)}</time>
              </div>
              {message.subject ? <p className="mt-2 text-sm font-semibold">{message.subject}</p> : null}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.body}</p>
              {message.attachmentNames?.length ? <p className="mt-3 text-xs font-semibold text-[#8b1629]">Pièce jointe : {message.attachmentNames.join(", ")}</p> : null}
            </li>;
          })}
        </ol>
      )}
    </section>
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
function ReopenDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (status: Exclude<RequestStatus, "annule">) => Promise<void> }) {
  const [status, setStatus] = useState<Exclude<RequestStatus, "annule">>("nouveau");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const options = requestStatusValues.filter((value): value is Exclude<RequestStatus, "annule"> => value !== "annule");
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"><section role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"><h2 className="font-serif text-2xl font-bold">Réouvrir le dossier</h2><p className="mt-2 text-sm text-stone-600">Le dossier est actuellement annulé. Ses données, notes, devis et historique seront conservés.</p><label className="mt-4 grid gap-1 text-sm font-semibold">Nouveau statut<select value={status} onChange={(event) => { setStatus(event.target.value as Exclude<RequestStatus, "annule">); setError(""); }} className="input">{options.map((value) => <option key={value} value={value}>{requestStatusConfig[value].label}</option>)}</select></label>{error ? <p className="mt-3 rounded bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p> : null}<div className="mt-5 flex justify-end gap-2"><button onClick={onClose} disabled={saving} className="px-3 py-2 text-sm font-bold">Annuler</button><button disabled={saving} onClick={async () => { setSaving(true); try { await onSubmit(status); } catch (reason) { setError(reason instanceof Error ? reason.message : "Réouverture impossible."); setSaving(false); } }} className="rounded-md bg-[#650d1c] px-3 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? "Réouverture…" : "Réouvrir le dossier"}</button></div></section></div>;
}

function MessageModal({
  initial,
  recipient,
  subject: initialSubject,
  templates,
  onClose,
  onSend,
  onSaveTemplate,
}: {
  initial: string;
  recipient?: string;
  subject: string;
  templates: EmailTemplate[];
  onClose: () => void;
  onSend: (subject: string, body: string, attachments: Array<{ filename: string; contentBase64: string; contentType: string }>) => Promise<void>;
  onSaveTemplate: (name: string, subject: string, body: string) => Promise<void>;
}) {
  const [message, setMessage] = useState(initial);
  const [subject, setSubject] = useState(initialSubject);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [attachments, setAttachments] = useState<Array<{ filename: string; contentBase64: string; contentType: string }>>([]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <section
        role="dialog"
        aria-modal="true"
        className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 className="font-serif text-2xl font-bold">
          Écrire au client
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          {recipient ? `Cet e-mail sera envoyé à ${recipient} et gardé dans le dossier.` : "Ajoutez d’abord l’adresse e-mail du client dans le dossier."}
        </p>
        {templates.length > 0 ? <label className="mt-4 grid gap-1 text-sm font-semibold">
          Utiliser un modèle enregistré
          <select
            defaultValue=""
            onChange={(event) => {
              const selected = templates.find((template) => template._id === event.target.value);
              if (selected) {
                setSubject(selected.subject);
                setMessage(selected.body);
              }
            }}
            className="input"
          >
            <option value="">Choisir un modèle…</option>
            {templates.map((template) => <option key={template._id} value={template._id}>{template.name}</option>)}
          </select>
        </label> : null}
        <label className="mt-4 grid gap-1 text-sm font-semibold">
          Objet
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input" />
        </label>
        <label className="mt-4 grid gap-1 text-sm font-semibold">
          Message
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="input min-h-48"
        />
        </label>
        <label className="mt-4 grid gap-1 text-sm font-semibold">
          Joindre le devis ou un document PDF
          <input
            type="file"
            accept="application/pdf,.pdf"
            multiple
            onChange={async (event) => {
              try {
                setError("");
                setAttachments(await readPdfAttachments(event.target.files));
              } catch (reason) {
                event.target.value = "";
                setAttachments([]);
                setError(reason instanceof Error ? reason.message : "Impossible de lire le PDF.");
              }
            }}
            className="input"
          />
          {attachments.length ? <span className="text-xs font-normal text-stone-500">{attachments.map((attachment) => attachment.filename).join(", ")}</span> : null}
        </label>
        {error ? <p className="mt-3 rounded-md bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={sending} className="px-3 py-2 text-sm font-bold">Annuler</button>
          <button
            type="button"
            disabled={!subject.trim() || !message.trim() || sending}
            onClick={async () => {
              const name = window.prompt("Nom du modèle (ex. Relance devis)");
              if (!name?.trim()) return;
              try {
                await onSaveTemplate(name, subject, message);
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : "Impossible d’enregistrer le modèle.");
              }
            }}
            className="px-3 py-2 text-sm font-bold text-[#8b1629] disabled:opacity-50"
          >
            Enregistrer comme modèle
          </button>
          <button
            onClick={async () => {
              setError("");
              setSending(true);
              try {
                await onSend(subject, message, attachments);
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : "Impossible d’envoyer l’e-mail.");
              } finally {
                setSending(false);
              }
            }}
            disabled={!recipient || !subject.trim() || !message.trim() || sending}
            className="rounded-md bg-[#650d1c] px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {sending ? "Envoi…" : "Envoyer l’e-mail"}
          </button>
        </div>
      </section>
    </div>
  );
}

async function readPdfAttachments(files: FileList | null) {
  const selected = Array.from(files ?? []);
  if (selected.length > 3) throw new Error("Vous pouvez joindre au maximum 3 fichiers.");
  return await Promise.all(selected.map(async (file) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      throw new Error("Seuls les fichiers PDF peuvent être joints.");
    }
    if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} dépasse 5 Mo.`);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(`Impossible de lire ${file.name}.`));
      reader.readAsDataURL(file);
    });
    const separator = dataUrl.indexOf(",");
    if (separator < 0) throw new Error(`Impossible de préparer ${file.name}.`);
    return { filename: file.name, contentBase64: dataUrl.slice(separator + 1), contentType: "application/pdf" };
  }));
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
async function copyQuickContact(value: string, message: string) {
  await navigator.clipboard.writeText(value);
  toast.success(message);
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
