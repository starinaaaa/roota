import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPool } from "./pool";
import { Query } from "./query";
import { storage } from "../storage";

export function createServerClient(): SupabaseClient {
  // Compile-time interface only. This object never calls PostgREST or Supabase.
  return {
    from: (table: string) => new Query(getPool(), table),
    rpc: (fn: string, args?: Record<string, unknown>) => new Query(getPool(), undefined, fn, args),
    storage,
  } as unknown as SupabaseClient;
}
