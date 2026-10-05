# Public Library / Module API

**Not applicable.** This repository is a single deployable Next.js application (`wgc-payments-finix-first`), not a published library or package — `package.json` has `"private": true` and there are no exported entry points intended for consumption by other packages/repos.

If a genuinely reusable, standalone module ever gets extracted from this codebase in the future (e.g. the Finix client wrapper in `src/lib/finix/client.ts`, or the background-job outbox in `src/lib/jobs/`), document its public exports here at that time, following the same style as [`API.md`](./API.md).

For the application's actual programmatic surface — its HTTP API — see [`API.md`](./API.md).
