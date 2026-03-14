// Next.js middleware — re-exports the session logic from proxy.ts.
// proxy.ts holds the implementation; this file is the entry point that
// Next.js actually picks up (only middleware.ts is auto-run at the edge).
export { proxy as middleware, config } from './proxy'
