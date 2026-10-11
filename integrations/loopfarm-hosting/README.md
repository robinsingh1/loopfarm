# Loopfarm hosted Pi harness

This Cloudflare Worker and container run Loopfarm's hosted T3 environment.
The private Control entrypoint provisions an owner-bound workspace and snapshots
it to R2 before idle shutdown. The caller must authenticate the user before
invoking that service binding. This preview currently supports one account.

The Pi completion hook uses Clef on Workers AI. It requests continue or verify,
leaves completed work idle, and pauses for blocked or uncertain work. It requires
no TypeSafe credits. In a new Pi coding chat, use `/loopfarm-judge status`, `on`,
or `off`. Child subagents are available through pi-subagents.

Pi Autoresearch 1.9.0 is installed in the hosted image. In a dedicated clean
project checkout, choose a Pi model in a new T3 thread, open Autoresearch,
provide the goal, metric, checks, and budget, then review and send the prompt.
New sessions save an `Autoresearch ·` title so they remain identifiable across
clients. You can also start `/autoresearch <objective and experiment budget>`.
Use `.auto/config.json` with `maxIterations` to cap recorded experiments.
The native tools measure, check, log, and keep/revert experiments; no Brave or
separate autoresearch key is needed. Pi uses the workspace's configured model.

In hosted RPC sessions, Clef owns automatic continuation. The bridge disables
upstream auto-resume handlers, requires `run_experiment` before logging and
checks the logged metric against the parsed primary measurement. Each turn can
log one experiment, then must yield. At the iteration limit, tools turn off but
Pi can summarize for Clef instead of aborting before review. Complete, Blocked,
low confidence, and the four-follow-up limit leave the session idle. Use
`/autoresearch off` to stop; terminal sessions retain upstream behavior.
Clef scores are completion judgments, not guarantees of research correctness.

Run focused tests with `node --test integrations/loopfarm-hosting/*.test.mjs`.
Deployment needs Cloudflare Containers, the configured private R2 bucket and
Workers AI. Use Wrangler 4.127.1 or later with the config in this directory.
Build the fork web client (`cd apps/web && T3CODE_WEB_SOURCEMAP=0 pnpm build`),
then copy `apps/web/dist/` into this directory as `web-dist/` before deploying.
The Docker image overlays these assets onto the pinned Linux x64 T3 package;
`web-dist/` is generated and must not be committed.
Always invoke the private Control checkpoint before replacing a live container;
an active-job refusal must not be overridden. Configure PUBLIC_ORIGIN for the
deployment. Never commit workspace snapshots or credentials.

This integration is separate from the Pi Durable research service. It does not
supply web search, research scheduling, or TypeSafe Jev inference.
