import { api } from "@ERPTrisThom/backend/convex/_generated/api";
import { toConvexQuote } from "@/domain/quote-payload";
import type { Id } from "@ERPTrisThom/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";

import { activeRequestStatuses } from "@/domain/request-status";
import {
  type CatalogItem,
  type CreateRequestInput,
  type EditableRequest,
  type LocalCrm,
  type LocalQuote,
  type LocalRequest,
  type Quote,
} from "@/lib/local-crm";

const ConvexCrmContext = createContext<LocalCrm | null>(null);

const requestId = (value: string) => value as Id<"requests">;
const followUpId = (value: string) => value as Id<"followUpTasks">;
const quoteVersionId = (value: string) => value as Id<"quoteVersions">;

export function ConvexCrmProvider({ children }: { children: React.ReactNode }) {
  const workspace = useQuery(api.crm.workspace);
  const createRequestMutation = useMutation(api.crm.createRequest);
  const updateStatusMutation = useMutation(api.crm.updateStatus);
  const reopenCancelledRequestMutation = useMutation(api.crm.reopenCancelledRequest);
  const qualifyRequestMutation = useMutation(api.crm.qualifyRequest);
  const updateRequestMutation = useMutation(api.crm.updateRequest);
  const addNoteMutation = useMutation(api.crm.addNote);
  const markHandledMutation = useMutation(api.crm.markHandled);
  const startQuotePreparationMutation = useMutation(api.crm.startQuotePreparation);
  const markQuoteSentMutation = useMutation(api.crm.markQuoteSent);
  const scheduleFollowUpMutation = useMutation(api.crm.scheduleFollowUp);
  const confirmServiceMutation = useMutation(api.crm.confirmService);
  const closeRequestMutation = useMutation(api.crm.closeRequest);
  const saveQuoteMutation = useMutation(api.crm.saveQuote);
  const createQuoteVersionMutation = useMutation(api.crm.createQuoteVersion);
  const restoreQuoteVersionMutation = useMutation(api.crm.restoreQuoteVersion);
  const deleteQuoteVersionMutation = useMutation(api.crm.deleteQuoteVersion);
  const saveCatalogItemMutation = useMutation(api.crm.saveCatalogItem);
  const deleteCatalogItemMutation = useMutation(api.crm.deleteCatalogItem);
  const completeFollowUpMutation = useMutation(api.crm.completeFollowUp);
  const archiveRequestMutation = useMutation(api.crm.archiveRequest);
  const deleteRequestMutation = useMutation(api.crm.deleteRequest);
  const clearAllRequestsMutation = useMutation(api.crm.clearAllRequests);

  const resetDemoData = useCallback(async () => {
    await clearAllRequestsMutation({});
  }, [clearAllRequestsMutation]);

  const createRequest = useCallback(
    async (input: CreateRequestInput) => {
      const {
        source,
        contactName,
        contactEmail,
        contactPhone,
        organizationName,
        eventType,
        eventDate,
        eventStartTime,
        eventEndTime,
        venue,
        eventAddress,
        guestCount,
        budgetCents,
        budgetPerPersonCents,
        message,
        specialNeeds,
        dietaryRequirements,
        staffingNeeds,
      } = input;
      return await createRequestMutation({
        source,
        contactName,
        contactEmail,
        contactPhone,
        organizationName,
        eventType,
        eventDate,
        eventStartTime,
        eventEndTime,
        venue,
        eventAddress,
        guestCount,
        budgetCents,
        budgetPerPersonCents,
        message,
        specialNeeds,
        dietaryRequirements,
        staffingNeeds,
      });
    },
    [createRequestMutation],
  );

  const updateStatus = useCallback<LocalCrm["updateStatus"]>(
    async ({ requestId: id, ...input }) => {
      await updateStatusMutation({ requestId: requestId(id), ...input });
    },
    [updateStatusMutation],
  );

  const reopenCancelledRequest = useCallback<LocalCrm["reopenCancelledRequest"]>(
    async (id, status) => {
      await reopenCancelledRequestMutation({ requestId: requestId(id), status });
    },
    [reopenCancelledRequestMutation],
  );

  const qualifyRequest = useCallback<LocalCrm["qualifyRequest"]>(
    async (id) => {
      await qualifyRequestMutation({ requestId: requestId(id) });
    },
    [qualifyRequestMutation],
  );

  const updateRequest = useCallback<LocalCrm["updateRequest"]>(
    async (id, changes: EditableRequest) => {
      await updateRequestMutation({
        requestId: requestId(id),
        changes: {
          ...("organizationName" in changes ? { organizationName: changes.organizationName ?? null } : {}),
          ...("contactName" in changes ? { contactName: changes.contactName ?? "Contact à identifier" } : {}),
          ...("contactEmail" in changes ? { contactEmail: changes.contactEmail ?? null } : {}),
          ...("contactPhone" in changes ? { contactPhone: changes.contactPhone ?? null } : {}),
          ...("eventType" in changes ? { eventType: changes.eventType ?? null } : {}),
          ...("eventDate" in changes ? { eventDate: changes.eventDate ?? null } : {}),
          ...("eventStartTime" in changes ? { eventStartTime: changes.eventStartTime ?? null } : {}),
          ...("eventEndTime" in changes ? { eventEndTime: changes.eventEndTime ?? null } : {}),
          ...("eventAddress" in changes ? { eventAddress: changes.eventAddress ?? null } : {}),
          ...("guestCount" in changes ? { guestCount: changes.guestCount ?? null } : {}),
          ...("budgetCents" in changes ? { budgetCents: changes.budgetCents ?? null } : {}),
          ...("budgetPerPersonCents" in changes ? { budgetPerPersonCents: changes.budgetPerPersonCents ?? null } : {}),
          ...("specialNeeds" in changes ? { specialNeeds: changes.specialNeeds ?? null } : {}),
          ...("dietaryRequirements" in changes ? { dietaryRequirements: changes.dietaryRequirements ?? null } : {}),
          ...("staffingNeeds" in changes ? { staffingNeeds: changes.staffingNeeds ?? null } : {}),
        },
      });
    },
    [updateRequestMutation],
  );

  const addNote = useCallback<LocalCrm["addNote"]>(
    async (id, content) => {
      await addNoteMutation({ requestId: requestId(id), content });
    },
    [addNoteMutation],
  );

  const markHandled = useCallback<LocalCrm["markHandled"]>(
    async (id) => {
      await markHandledMutation({ requestId: requestId(id) });
    },
    [markHandledMutation],
  );

  const startQuotePreparation = useCallback<LocalCrm["startQuotePreparation"]>(
    async (id) => {
      await startQuotePreparationMutation({ requestId: requestId(id) });
    },
    [startQuotePreparationMutation],
  );

  const markQuoteSent = useCallback<LocalCrm["markQuoteSent"]>(
    async (id) => {
      await markQuoteSentMutation({ requestId: requestId(id) });
    },
    [markQuoteSentMutation],
  );

  const scheduleFollowUp = useCallback<LocalCrm["scheduleFollowUp"]>(
    async (id, dueAt) => {
      await scheduleFollowUpMutation({ requestId: requestId(id), dueAt });
    },
    [scheduleFollowUpMutation],
  );

  const confirmService = useCallback<LocalCrm["confirmService"]>(
    async (id) => {
      await confirmServiceMutation({ requestId: requestId(id) });
    },
    [confirmServiceMutation],
  );

  const closeRequest = useCallback<LocalCrm["closeRequest"]>(
    async (id, status, reason) => {
      await closeRequestMutation({ requestId: requestId(id), status, reason });
    },
    [closeRequestMutation],
  );

  const saveQuote = useCallback<LocalCrm["saveQuote"]>(
    async (id, quote: LocalQuote) => {
      await saveQuoteMutation({ requestId: requestId(id), quote: toConvexQuote(quote) });
    },
    [saveQuoteMutation],
  );

  const createQuoteVersion = useCallback<LocalCrm["createQuoteVersion"]>(
    async (id, quote) => {
      return await createQuoteVersionMutation({ requestId: requestId(id), quote });
    },
    [createQuoteVersionMutation],
  );

  const restoreQuoteVersion = useCallback<LocalCrm["restoreQuoteVersion"]>(
    async (id, versionId) => {
      return await restoreQuoteVersionMutation({
        requestId: requestId(id),
        versionId: quoteVersionId(versionId),
      });
    },
    [restoreQuoteVersionMutation],
  );

  const deleteQuoteVersion = useCallback<LocalCrm["deleteQuoteVersion"]>(
    async (id, versionId) => {
      await deleteQuoteVersionMutation({
        requestId: requestId(id),
        versionId: quoteVersionId(versionId),
      });
    },
    [deleteQuoteVersionMutation],
  );

  const saveCatalogItem = useCallback<LocalCrm["saveCatalogItem"]>(
    async (item: CatalogItem) => {
      await saveCatalogItemMutation({ item });
    },
    [saveCatalogItemMutation],
  );

  const deleteCatalogItem = useCallback<LocalCrm["deleteCatalogItem"]>(
    async (itemId) => {
      await deleteCatalogItemMutation({ itemId });
    },
    [deleteCatalogItemMutation],
  );

  const completeFollowUp = useCallback<LocalCrm["completeFollowUp"]>(
    async (id, taskId) => {
      await completeFollowUpMutation({
        requestId: requestId(id),
        followUpId: followUpId(taskId),
      });
    },
    [completeFollowUpMutation],
  );

  const archiveRequest = useCallback<LocalCrm["archiveRequest"]>(
    async (id) => {
      await archiveRequestMutation({ requestId: requestId(id), archived: true });
    },
    [archiveRequestMutation],
  );

  const restoreRequest = useCallback<LocalCrm["restoreRequest"]>(
    async (id) => {
      await archiveRequestMutation({ requestId: requestId(id), archived: false });
    },
    [archiveRequestMutation],
  );

  const deleteRequest = useCallback<LocalCrm["deleteRequest"]>(
    async (id) => {
      await deleteRequestMutation({ requestId: requestId(id) });
    },
    [deleteRequestMutation],
  );

  const requests = (workspace?.requests ?? []) as LocalRequest[];
  const quotes = (workspace?.quotes ?? []) as Quote[];
  const catalog = (workspace?.catalog ?? []) as CatalogItem[];

  const value = useMemo<LocalCrm>(() => {
    const now = Date.now();
    const nonDeletedRequests = requests.filter((request) => !request.deletedAt);
    const visibleRequests = nonDeletedRequests.filter((request) => !request.archivedAt);
    const archivedRequests = nonDeletedRequests.filter((request) => request.archivedAt);
    const active = visibleRequests.filter((request) =>
      activeRequestStatuses.includes(request.status),
    );
    const decided = visibleRequests.filter((request) =>
      ["accepte", "refuse", "annule"].includes(request.status),
    );
    const accepted = decided.filter((request) => request.status === "accepte");
    const clientMap = new Map<string, LocalCrm["clients"][number]>();
    for (const request of nonDeletedRequests) {
      const key =
        request.contactEmail?.toLowerCase() ??
        request.contactPhone ??
        request.contactName.toLowerCase();
      const existing = clientMap.get(key);
      clientMap.set(key, {
        name: request.contactName,
        email: request.contactEmail ?? existing?.email,
        phone: request.contactPhone ?? existing?.phone,
        organization: request.organizationName ?? existing?.organization,
        requestCount: (existing?.requestCount ?? 0) + 1,
        lastRequestAt: Math.max(existing?.lastRequestAt ?? 0, request.createdAt),
      });
    }
    return {
      requests: visibleRequests,
      archivedRequests,
      quotes,
      catalog,
      clients: [...clientMap.values()].sort(
        (first, second) => second.lastRequestAt - first.lastRequestAt,
      ),
      createRequest,
      updateStatus,
      reopenCancelledRequest,
      qualifyRequest,
      updateRequest,
      addNote,
      markHandled,
      startQuotePreparation,
      markQuoteSent,
      scheduleFollowUp,
      confirmService,
      closeRequest,
      saveQuote,
      createQuoteVersion,
      restoreQuoteVersion,
      deleteQuoteVersion,
      saveCatalogItem,
      deleteCatalogItem,
      completeFollowUp,
      archiveRequest,
      restoreRequest,
      deleteRequest,
      resetDemoData,
      dashboard: {
        metrics: {
          activeRequests: active.length,
          quotesToPrepare: visibleRequests.filter(
            (request) => request.status === "devis_a_preparer",
          ).length,
          pipelineCents: active.reduce((total, request) => {
            const quote = quotes.find((item) => item.requestId === request._id);
            return total + (quote?.totalTtcCents ?? request.budgetCents ?? 0);
          }, 0),
          conversionRate: decided.length
            ? Math.round((accepted.length / decided.length) * 100)
            : null,
        },
        priorities: visibleRequests
          .flatMap((request) =>
            request.followUps
              .filter(
                (task) => !task.completedAt && task.dueAt <= now + 7 * 86_400_000,
              )
              .map((task) => ({
                _id: task.id,
                requestId: request._id,
                title: task.title,
                dueAt: task.dueAt,
                completedAt: task.completedAt,
              })),
          )
          .sort((first, second) => first.dueAt - second.dueAt)
          .slice(0, 8),
        upcomingEvents: visibleRequests
          .filter(
            (request) =>
              request.eventDate &&
              request.eventDate >= now &&
              request.status !== "annule",
          )
          .sort((first, second) => (first.eventDate ?? 0) - (second.eventDate ?? 0))
          .slice(0, 5),
        monthRequests: visibleRequests.filter((request) => request.eventDate),
        pipeline: activeRequestStatuses.map((status) => ({
          status,
          count: visibleRequests.filter((request) => request.status === status).length,
        })),
      },
    };
  }, [
    addNote,
    archiveRequest,
    catalog,
    closeRequest,
    completeFollowUp,
    confirmService,
    createQuoteVersion,
    createRequest,
    deleteCatalogItem,
    deleteRequest,
    deleteQuoteVersion,
    markHandled,
    markQuoteSent,
    qualifyRequest,
    quotes,
    requests,
    resetDemoData,
    reopenCancelledRequest,
    restoreRequest,
    restoreQuoteVersion,
    saveCatalogItem,
    saveQuote,
    scheduleFollowUp,
    startQuotePreparation,
    updateRequest,
    updateStatus,
  ]);

  return (
    <ConvexCrmContext.Provider value={value}>
      {children}
    </ConvexCrmContext.Provider>
  );
}

export function useConvexCrm() {
  const value = useContext(ConvexCrmContext);
  if (!value) throw new Error("useConvexCrm doit être utilisé dans ConvexCrmProvider");
  return value;
}
