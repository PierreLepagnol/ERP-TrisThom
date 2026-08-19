export type SoftDeletedRequest = {
  deletedAt?: number;
};

export function isVisibleRequest(request: SoftDeletedRequest) {
  return request.deletedAt === undefined;
}

/** A source identifier stays reserved after a voluntary deletion. */
export function canCreateRequestForSource(existingRequest: SoftDeletedRequest | null) {
  return existingRequest === null;
}
