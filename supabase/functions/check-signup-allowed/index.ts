/**
 * check-signup-allowed
 *
 * Phase 2A signup preflight. Thin runtime wrapper — the actual logic lives
 * in handler.ts so integration tests can import it directly without
 * starting an HTTP server. See handler.ts for the full security rationale.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleSignupCheck, readEnv } from "./handler.ts";

serve((req) => handleSignupCheck(req, readEnv()));
