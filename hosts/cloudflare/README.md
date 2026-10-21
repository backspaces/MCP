# Cloudflare Workers

Our servers run on Cloudflare at a fixed address, with no computer of ours
involved:

    https://mcp.<your-subdomain>.workers.dev/dice      (and /hello, /recipes)

That's the address to give claude.ai and ChatGPT, once, for good.

## Cloudflare in five minutes

**Cloudflare** started as a network that sits in front of websites: requests
reach one of its data centers near the visitor, in more than 300 cities, before
reaching the site. The tunnel in [docs/remote.md](../../docs/remote.md) used
that network to reach your Mac.

**Workers** lets that network run your own code. You upload JavaScript, and
each request runs it in the data center nearest the caller. There's no server
for you to keep running or patch.

- **A Worker is a fetch handler.** `export default { fetch(request) { … } }`,
  the same shape our `mcp.ts` already makes. That's why
  [worker.ts](worker.ts) is three lines.
- **It isn't Deno or Node.** It's Cloudflare's own runtime, `workerd`, built on
  the same JavaScript engine as Chrome. It has the web standards (`fetch`,
  `Request`, `Response`, `URL`), plus Node's built-in modules when
  `nodejs_compat` is on. There are no files and no command-line arguments,
  which is why [servers.ts](../../servers.ts) lists the servers by hand.
- **Each request starts fresh.** Copies of a Worker start and stop all the time,
  in many places at once, so nothing kept in a variable survives between
  requests. Ours keep nothing, so that's fine. Servers that need to remember
  things use Cloudflare's storage (KV, D1, Durable Objects).
- **`workers.dev` is free hosting with an address.** Each account picks one
  subdomain (for example `backspaces`), and every Worker gets
  `<worker-name>.<subdomain>.workers.dev`, with HTTPS. A domain of your own
  can be added later.
- **The free plan** covers far more than we'll use: on the order of 100,000
  requests a day. Check the current numbers on Cloudflare's
  [pricing](https://developers.cloudflare.com/workers/platform/pricing/) and
  [limits](https://developers.cloudflare.com/workers/platform/limits/) pages.

**Wrangler** is Cloudflare's command-line tool: it logs in to your account,
runs a Worker locally on `workerd`, and bundles and uploads it. It's an npm
package, and we run it through Deno, so no Node install or upgrade is
needed.

## The files

| File | What it is |
| --- | --- |
| [worker.ts](worker.ts) | the Worker: `mount(servers)` from `mcp.ts` |
| [wrangler.jsonc](wrangler.jsonc) | the Worker's name (`mcp`), entry file, runtime date and flags |
| `deno.json` tasks (repo root) | `deno task cf:dev`, `cf:deploy`, and `cf` for any other wrangler command |
| `package.json` (repo root) | the packages wrangler bundles in, from `node_modules` |

Wrangler bundles the Worker the way Node finds packages, in `node_modules`, so
the Cloudflare commands need `npm install` once in the repo. Deno's own
commands don't.

## Steps

Run all of these from the repo root.

**1. Install the packages (once).**

    npm install

It installs three small packages into `node_modules/`, which git ignores. In
Dropbox, tell Dropbox to skip that folder:

    xattr -w 'com.apple.fileprovider.ignore#P' 1 node_modules

**2. Try it locally.**

    deno task cf:dev

This runs the Worker on your Mac with Cloudflare's real runtime, at
http://localhost:8787. Open it to see the list of servers. Ctrl-C stops it.

**3. Log in (once).**

    deno task cf login

Your browser opens Cloudflare's page asking to let Wrangler use your account.
Allow it. Wrangler keeps the login on your Mac; `deno task cf whoami` shows
which account it's using, and `deno task cf logout` forgets it.

**4. Deploy.**

    deno task cf:deploy

Wrangler bundles everything (about 230 KB compressed) and uploads it. The first
time, if your account has no `workers.dev` subdomain yet, it asks you to pick
one. It ends by printing the Worker's address. Open it in a browser: you
should see the list of servers.

Deploy again after any change. Each deploy replaces the last, at the same
address, within seconds.

**5. Add the connectors.**

| App | Where | URL |
| --- | --- | --- |
| claude.ai | Customize → Connectors → Add custom connector | `https://mcp.<subdomain>.workers.dev/dice` |
| ChatGPT | Plugins → Add → Add custom MCP server, authentication none | the same |

One connector per server: `/dice`, `/recipes`, `/hello`.

## Watching it

- `deno task cf tail` streams each request and any `console.log` from the live
  Worker, as it happens.
- The Cloudflare dashboard, under **Workers & Pages → mcp**, shows requests,
  errors and logs (`observability` is on in `wrangler.jsonc`), and its
  settings.
- `deno task cf delete` removes the Worker and its address.

## Safety

The servers have no login, so anyone who finds the address can call them.
That's fine for dice and recipes. A private server needs OAuth first.
Cloudflare has a ready-made library for that,
[workers-oauth-provider](https://github.com/cloudflare/workers-oauth-provider).
