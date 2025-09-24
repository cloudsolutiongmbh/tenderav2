/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as auth from "../auth.js";
import type * as docPages from "../docPages.js";
import type * as documents from "../documents.js";
import type * as healthCheck from "../healthCheck.js";
import type * as privateData from "../privateData.js";
import type * as projects from "../projects.js";
import type * as shares from "../shares.js";
import type * as templates from "../templates.js";
import type * as todos from "../todos.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  docPages: typeof docPages;
  documents: typeof documents;
  healthCheck: typeof healthCheck;
  privateData: typeof privateData;
  projects: typeof projects;
  shares: typeof shares;
  templates: typeof templates;
  todos: typeof todos;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
