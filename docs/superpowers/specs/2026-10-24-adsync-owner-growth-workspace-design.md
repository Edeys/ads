# AdsSync Owner Growth Workspace — Design

Date: 2026-10-24

## Goal

Make the existing AdsSync app a dependable, owner-operated growth workspace. The owner connects platform accounts once, creates a scoped MCP credential for agents, and uses agents to inspect organic social, paid campaigns, website search performance, and analytics. Agents may prepare proposed changes; actions that affect live accounts remain behind the existing approval flow.

The owner will complete external OAuth consent and platform permissions later. This work prepares the product and its connection flows without inventing credentials or claiming an external account is connected before a real authorized flow succeeds.

## Product boundary

The first delivery targets the integrations already present in this repository:

- Meta Page and Meta Ads
- TikTok Ads
- Google Ads
- Google Search Console
- GA4 and Microsoft Clarity
- Existing WordPress and generic webhook publishing connectors

It will improve the connector boundaries so additional organic social providers can be added later. It will not claim TikTok organic publishing, Instagram, YouTube, LinkedIn, backlink research, rank tracking, or technical site crawling until their provider APIs and required access have been implemented and verified.

## Existing foundation

The app already has a workspace model, encrypted provider credentials, provider OAuth flows, MCP keys with scopes, an MCP JSON-RPC endpoint, GSC/GA4/Clarity read tools, Meta Page and ad tools, an approval queue, a content hub, CMS publishing connectors, audit records, and background jobs. The design extends these pieces instead of replacing the Next.js/PGlite application.

## Core user journey

1. The owner opens a guided connections screen and connects a provider. The app lists the accounts/sites available to that credential and lets the owner select which ones this workspace will use.
2. The owner creates a named MCP key, chooses read access by provider, and separately enables write proposals where supported. The app shows the exact tools exposed and provides copy-ready client configuration using a header-based secret.
3. The owner runs a connection check from the app. The result distinguishes authorization errors, missing scopes, expired tokens, provider quota limits, and healthy connections.
4. An agent runs a growth review using selected accounts and date ranges. It can compare GSC queries/pages, GA4 landing-page outcomes, Meta Page post engagement, and paid campaign performance. It must identify the source and time range for each metric and avoid silently combining incompatible attribution windows or currencies.
5. The agent can prepare content or account changes. A live publish, comment response, budget change, or campaign status change becomes an approval item with a readable diff, target account, rationale, and expected effect. Approval execution rechecks workspace ownership, key/tool scope, and current connection health.
6. The owner can inspect the result in activity and revoke the MCP key or disconnect a provider at any time.

## Architecture and authorization

Keep the current Next.js App Router, Drizzle/PGlite storage, provider libraries, MCP endpoint, and in-process worker. Tighten the boundary between an MCP key and every provider connection:

- Every built-in and custom MCP operation is authorized against the key's `bizId`; a submitted connection ID must belong to that same workspace.
- Recheck workspace ownership when an approval is executed, not only when the agent creates it.
- Require `mcp_keys.access` for key creation, editing, and revocation at the API layer. Enforce provider scopes and write permission independently of UI visibility.
- Use least-privilege defaults for newly created keys. Expose only tools whose provider scopes are granted, and show those scopes before key creation.
- Keep credentials encrypted at rest; redact tokens, keys, and sensitive payloads from errors and activity logs.
- Generate copy-ready agent configuration that sends credentials in a header. Preserve existing client compatibility during migration and make URL query credentials a legacy path rather than the recommended setup.
- Keep all live writes approval-gated. Validate the target connection and action again at approval time; record the approver, request, result, and failure reason.

The MCP request path is: resolve MCP identity → enforce key status/expiry/rate limit → enforce tool scope → enforce workspace ownership of referenced records → call provider adapter → normalize and redact result → record audit. Write tools stop at a pending approval until an authorized owner accepts them.

## Growth capabilities

### Read and analysis

- Keep the existing GSC site list and Search Analytics query/page reports; make date range and selected site explicit.
- Keep GA4 report and Clarity insight tools with visible data freshness and provider limitations.
- Expand Meta organic reporting only where the granted Graph API permissions support it; separate page-level insights from per-post engagement.
- Keep ads reporting by provider/account/campaign and surface currency, timezone, date range, and reporting level.
- Add an agent-facing growth-review instruction/skill that teaches account discovery, selection when multiple accounts exist, source attribution, and evidence-based recommendations.

### Content and actions

- Expose existing content clusters, drafts, and site destinations to agents through workspace-scoped tools.
- Allow agents to create or edit drafts and SEO metadata. Publishing remains an approval-gated action and uses the configured CMS connector.
- Keep Meta Page publishing and comment actions behind approval. Keep ad writes scoped to the providers that have implemented and verified real write adapters; read-only integrations stay read-only.
- Give approval items a clear preview of the content or account fields that will change.

This release focuses on useful cross-source analysis and safe draft-to-approval workflows. It does not promise autonomous SEO strategy, guaranteed ranking gains, or an unverified cross-platform attribution model.

## UI and UX

Shape the existing app around four owner tasks:

1. **Connect:** provider catalog, connection health, granted/missing scopes, and selected accounts/sites.
2. **Give agent access:** key name, provider scopes, read/write capability, visible tool list, copyable setup, last use, and revoke action.
3. **Review growth:** one workspace view with explicit provider, account/site, date range, metric definitions, and links from a finding to its source data.
4. **Approve changes:** a focused queue showing who/what/where, before/after values, rationale, and outcome.

Use progressive disclosure: onboarding guides the first connection and key setup; advanced scope and field selection remain available without overwhelming first use. Keep empty, loading, stale-data, partial-failure, permission-denied, and disconnected states distinct. Do not show mock data as live data without a persistent mock/demo label.

## Failure behavior and operations

- A failed provider must not make other providers' results disappear; return partial results with per-source status.
- Retry transient provider errors with bounded backoff; do not retry writes automatically.
- Handle token refresh and expiry through the existing connection layer and show reconnect guidance.
- Respect provider quotas and expose the last successful fetch time.
- Keep PGlite single-process constraints and the current worker model. Do not introduce a second writer to `.pgdata`.
- Preserve backups/migrations and ensure the health endpoint reports whether the worker and data store are ready without exposing secrets.

## Delivery stages

1. **Security foundation:** enforce workspace isolation for MCP credentials, permissions for key management, safe secret transport, and approval-time revalidation.
2. **Agent-ready connectors:** normalize connection discovery/health and tool schemas for existing ads, GSC, GA4, Clarity, Meta Page, and content integrations; document which providers are read-only versus writable.
3. **Growth workflows:** add scoped content and SEO draft tools plus an evidence-based growth-review skill/instructions. Keep writes approval-gated.
4. **Owner UX:** improve connection onboarding, MCP key setup, unified growth review, and approval previews with reliable loading/error/empty states.
5. **Verification and handoff:** run TypeScript/build checks and existing verification scripts relevant to changed flows. Live OAuth and provider API validation happen only after the owner grants access.

The stages are ordered; do not start broad UI polish before the security boundary is in place.

## Success criteria

- An MCP key cannot read or mutate a connection owned by another workspace, even if given that connection's ID.
- A member without `mcp_keys.access` cannot create or revoke keys through direct API calls.
- A read-only key cannot invoke write tools; a write-capable key can only create approval requests, and approval execution rechecks workspace ownership.
- An owner can discover connected accounts/sites, create a least-privilege key, see its available tools, and copy a working client configuration without exposing the secret in a URL.
- Agents can query the existing supported sources with explicit account/site and date range, and receive partial-source errors without losing successful results.
- Agents can create content drafts and request publishing approval through existing CMS destinations; no live write occurs before approval.
- The connection, growth review, and approval flows have clear loading, empty, stale, permission, and failure states.
- Production build and applicable existing verification scripts pass. Real OAuth/API success is reported only after owner-authorized live validation.

## Explicit assumptions

- This is an owner-first product while retaining the current multi-workspace architecture.
- External OAuth consent and platform permissions are owner-operated later.
- Existing live-write approval is a product safety requirement and remains enabled.
- New social providers are not silently included in the first implementation; they need a separate provider/API scope decision.
