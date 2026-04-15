import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Phase 2 signup hardening — client-side BotID initialization.
//
// When `VITE_SIGNUP_PREFLIGHT_ENABLED === "true"` the Vercel BotID client
// library registers the `/api/check-signup-allowed` route as a protected
// endpoint. Any subsequent `fetch('/api/check-signup-allowed', ...)` call
// will automatically receive BotID challenge headers, which the Vercel
// Function wrapper then verifies via `checkBotId()`.
//
// With the flag OFF (Phase 2A default), initBotId is never called —
// BotID adds no scripts, no headers, no runtime cost. The signup flow
// behaves exactly like it did before Phase 2.
//
// The protected route list MUST match `initBotId({ protect })` server-side
// expectations: if we later add more protected endpoints (e.g. password
// reset preflight, tip checkout), add them here.
if (import.meta.env.VITE_SIGNUP_PREFLIGHT_ENABLED === "true") {
  void import("botid/client/core").then(({ initBotId }) => {
    initBotId({
      protect: [{ path: "/api/check-signup-allowed", method: "POST" }],
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
