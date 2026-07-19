import { businessReferenceData } from "./reference.generated";
import type { BusinessReference } from "./types";

export const businessReference = businessReferenceData as unknown as BusinessReference;
export * from "./types";
