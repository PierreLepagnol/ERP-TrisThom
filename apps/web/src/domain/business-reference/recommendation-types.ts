import type { DataStatus, ProductionLoad, SaleUnit } from "./types";

export type RecommendationSection = "cold" | "hot" | "sweet" | "starter" | "main" | "side" | "dessert" | "sharing" | "bakery" | "drink" | "service" | "option";
export type RecommendationLine = { id: string; catalogItemId?: string; offerCompositionId?: string; section: RecommendationSection; label: string; quantity: number; unit: SaleUnit; unitPriceHtCents: number; vatRate: number; totalHtCents: number; materialCostCents?: number; productionBaseIds: string[]; dataStatus: DataStatus };
export type ScoreBreakdown = { need: number; budget: number; margin: number; production: number; venueAndDuration: number; season: number; mutualization: number };
export type StructuredRecommendation = { lines: RecommendationLine[]; totalHtCents: number; totalVatCents: number; totalTtcCents: number; foodCostCents?: number; materialMarginCents?: number; productionLoad: ProductionLoad; scoreBreakdown: ScoreBreakdown; score: number; targetPiecesPerPerson?: number; actualPiecesPerPerson?: number; totalPieces?: number };
