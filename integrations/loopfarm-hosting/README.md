# Loopfarm hosted Pi harness

This Cloudflare Worker and container run Loopfarm's hosted T3 environment.
The private Control entrypoint provisions an owner-bound workspace and snapshots
it to R2 before idle shutdown. The caller must authenticate the user before
invoking that service binding. This preview currently supports one account.

The Pi completion hook uses Clef on Workers AI. It requests continue or verify,
leaves completed work idle, and pauses for blocked or uncertain work. It requires
no TypeSafe credits. In a new Pi coding chat, use `/loopfarm-judge status`, `on`,
or `off`. Child subagents are available through pi-subagents.

Run focused tests with `node --test integrations/loopfarm-hosting/*.test.mjs`.
Deployment needs Cloudflare Containers, the configured private R2 bucket and
Workers AI. Use Wrangler 4.127.1 or later with the config in this directory.
Always invoke the private Control checkpoint before replacing a live container;
an active-job refusal must not be overridden. Configure PUBLIC_ORIGIN for the
deployment. Never commit workspace snapshots or credentials.

This integration is separate from the Pi Durable research service. It does not
supply web search, research scheduling, or TypeSafe Jev inference.
