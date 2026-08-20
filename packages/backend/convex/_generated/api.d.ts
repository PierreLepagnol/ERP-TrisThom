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
import type * as connectionChecks from "../connectionChecks.js";
import type * as connectionDiagnostics from "../connectionDiagnostics.js";
import type * as crm from "../crm.js";
import type * as crmImport from "../crmImport.js";
import type * as crons from "../crons.js";
import type * as customerEmail from "../customerEmail.js";
import type * as customerEmailData from "../customerEmailData.js";
import type * as destructiveOperations from "../destructiveOperations.js";
import type * as directus from "../directus.js";
import type * as directusSync from "../directusSync.js";
import type * as directusWebhook from "../directusWebhook.js";
import type * as emailTemplates from "../emailTemplates.js";
import type * as healthCheck from "../healthCheck.js";
import type * as http from "../http.js";
import type * as inbox from "../inbox.js";
import type * as inboxPolicy from "../inboxPolicy.js";
import type * as inboxPoller from "../inboxPoller.js";
import type * as magicLinkEmail from "../magicLinkEmail.js";
import type * as pdfImport from "../pdfImport.js";
import type * as privateData from "../privateData.js";
import type * as requestDeletion from "../requestDeletion.js";
import type * as requestDocuments from "../requestDocuments.js";
import type * as requestParsing from "../requestParsing.js";
import type * as requestReview from "../requestReview.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  connectionChecks: typeof connectionChecks;
  connectionDiagnostics: typeof connectionDiagnostics;
  crm: typeof crm;
  crmImport: typeof crmImport;
  crons: typeof crons;
  customerEmail: typeof customerEmail;
  customerEmailData: typeof customerEmailData;
  destructiveOperations: typeof destructiveOperations;
  directus: typeof directus;
  directusSync: typeof directusSync;
  directusWebhook: typeof directusWebhook;
  emailTemplates: typeof emailTemplates;
  healthCheck: typeof healthCheck;
  http: typeof http;
  inbox: typeof inbox;
  inboxPolicy: typeof inboxPolicy;
  inboxPoller: typeof inboxPoller;
  magicLinkEmail: typeof magicLinkEmail;
  pdfImport: typeof pdfImport;
  privateData: typeof privateData;
  requestDeletion: typeof requestDeletion;
  requestDocuments: typeof requestDocuments;
  requestParsing: typeof requestParsing;
  requestReview: typeof requestReview;
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
