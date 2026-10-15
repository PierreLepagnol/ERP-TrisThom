import { afterEach, expect, test, type vi as VitestVi } from "../../../../packages/backend/node_modules/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { InboxCreateForm } from "./inbox-create-form";
import type { Id } from "@ERPTrisThom/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@ERPTrisThom/backend/convex/_generated/api";

declare const vi: typeof VitestVi;
const mocks = vi.hoisted(() => ({ save: vi.fn(), duplicates: [[]] as unknown[][], results: [] as unknown[] }));
vi.mock("convex/react", () => ({
  useMutation: () => mocks.save,
  useQuery: () => mocks.duplicates,
  usePaginatedQuery: () => ({ results: mocks.results, status: "Exhausted", loadMore: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.duplicates = [[]]; mocks.results = []; });
type Entry = FunctionReturnType<typeof api.inboxEntries.list>[number];
const entry = {
  _id: "entry-test" as Id<"inboxMessages">, _creationTime: 1, externalId: "site-test", source: "directus", senderName: "Site",
  body: "Six dates dans le texte : 3, 10 octobre, 6, 20, 28 novembre et 18 décembre.",
  sourceData: { contactName: "Théâtre", contactEmail: "client@example.test", contactPhone: "0123456789", eventDate: Date.parse("2026-10-03T10:00:00Z"), guestCount: 31, eventAddress: "Salle", cateringFormat: "Buffet", format: "Livraison", adminNotes: "Interne" },
  attachmentNames: [], hasPdfAttachment: false, outcome: "review", reviewStatus: "pending", createdAt: 1, requestIds: [], analysis: null,
} satisfies Entry;
test("one prefilled row, manual addition and duplication keep independent editable fields", () => {
  render(<InboxCreateForm entry={entry} close={vi.fn()} />);
  expect(screen.getByLabelText("Nom")).toHaveProperty("value", "Théâtre");
  expect(screen.getByLabelText("Téléphone")).toHaveProperty("value", "0123456789");
  expect(screen.getAllByLabelText("Date")).toHaveLength(1);
  expect(screen.getByLabelText("Date")).toHaveProperty("value", "2026-10-03");
  expect(screen.getByLabelText("Personnes")).toHaveProperty("value", "31");
  fireEvent.click(screen.getByRole("button", { name: "Dupliquer" }));
  expect(screen.getAllByLabelText("Date")).toHaveLength(2);
  fireEvent.change(screen.getAllByLabelText("Date")[1]!, { target: { value: "2026-10-10" } });
  expect(screen.getAllByLabelText("Date")[0]).toHaveProperty("value", "2026-10-03");
  expect(screen.getByRole("button", { name: "Créer 2 dossiers" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Ajouter une date" }));
  expect(screen.getAllByLabelText("Date")[2]).toHaveProperty("value", "");
  fireEvent.click(screen.getAllByRole("button", { name: "Supprimer" })[2]!);
  expect(screen.getAllByLabelText("Date")).toHaveLength(2);
});
test("one submission sends all rows once and permits safe replay with the same token after failure", async () => {
  let reject!: (reason: Error) => void;
  mocks.save.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; })).mockResolvedValue(["first", "second"]);
  const close = vi.fn(); render(<InboxCreateForm entry={entry} close={close} />);
  fireEvent.click(screen.getByRole("button", { name: "Dupliquer" }));
  fireEvent.change(screen.getAllByLabelText("Date")[1]!, { target: { value: "2026-10-10" } });
  const button = screen.getByRole("button", { name: "Créer 2 dossiers" });
  fireEvent.click(button); fireEvent.click(button);
  expect(mocks.save).toHaveBeenCalledTimes(1);
  const first = mocks.save.mock.calls[0]![0];
  expect(first.rows).toHaveLength(2);
  expect(first.contactName).toBe("Théâtre");
  expect(first.adminNotes).toBe("Interne");
  expect(first.rows.map((row: { guestCount: number }) => row.guestCount)).toEqual([31, 31]);
  reject(new Error("Connexion interrompue"));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Connexion interrompue"));
  expect(close.mock.calls).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Créer 2 dossiers" }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(mocks.save.mock.calls[1]![0].token).toBe(first.token);
});
test("duplicate warning offers an existing target without silently confirming or creating it", async () => {
  mocks.duplicates = [[{ _id: "existing", contactName: "Théâtre", eventDate: Date.parse("2026-10-03T10:00:00Z"), eventType: "Livraison", eventAddress: "Salle", guestCount: 31, status: "accepte" }]];
  mocks.save.mockResolvedValue(["existing"]);
  render(<InboxCreateForm entry={entry} close={vi.fn()} />);
  const warning = screen.getByText(/Doublon potentiel/).parentElement!;
  expect(within(warning).getByRole("checkbox")).toHaveProperty("checked", false);
  fireEvent.click(screen.getByRole("button", { name: /Rattacher : Théâtre/ }));
  expect(screen.getByRole("button", { name: "Rattacher 1 dossier(s)" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Rattacher 1 dossier(s)" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
  expect(mocks.save.mock.calls[0]![0].rows[0].existingRequestId).toBe("existing");
});
