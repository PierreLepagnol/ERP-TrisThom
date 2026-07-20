/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as crm from "../crm.js";
import type * as crons from "../crons.js";
import type * as directus from "../directus.js";
import type * as healthCheck from "../healthCheck.js";
import type * as http from "../http.js";
import type * as inbox from "../inbox.js";
import type * as inboxPoller from "../inboxPoller.js";
import type * as magicLinkEmail from "../magicLinkEmail.js";
import type * as privateData from "../privateData.js";
import type * as requestParsing from "../requestParsing.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  crm: typeof crm;
  crons: typeof crons;
  directus: typeof directus;
  healthCheck: typeof healthCheck;
  http: typeof http;
  inbox: typeof inbox;
  inboxPoller: typeof inboxPoller;
  magicLinkEmail: typeof magicLinkEmail;
  privateData: typeof privateData;
  requestParsing: typeof requestParsing;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
