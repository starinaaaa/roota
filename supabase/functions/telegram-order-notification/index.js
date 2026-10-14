import { telegramRelay } from "./handler.js";
Deno.serve(telegramRelay(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")));
