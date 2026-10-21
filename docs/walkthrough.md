# From Local to the Web: a Walkthrough

Oct 21, 2026 · Owen Densmore

In one day our three MCP servers went from running only inside Claude Code to
running on Cloudflare, used by claude.ai and ChatGPT. One repo serves them
all, and the server files themselves never changed. This is how, in order.

## Where we ended up

```
                      ┌──────────────── one repo: github.com/backspaces/MCP ────────────────┐
                      │                                                                     │
                      │   servers/dice.ts  hello.ts  recipes.ts     what each server offers │
                      │   servers.ts                                the list of them        │
                      │   mcp.ts                                    MCP over HTTP or stdio  │
                      │   hosts/deno/   hosts/cloudflare/           where they run          │
                      └─────────────────────────────────────────────────────────────────────┘
                                   │                         │
            starts each over stdio │                         │ deno task cf:deploy
                                   ▼                         ▼
                            Claude Code            mcp.backspaces.workers.dev/<server>
                          (your Mac, .mcp.json)                ▲               ▲
                                                               │               │
                                                           claude.ai        ChatGPT
```

| Client | How it reaches the servers |
| --- | --- |
| Claude Code | starts them on your Mac over stdio, from `.mcp.json` |
| claude.ai | `https://mcp.backspaces.workers.dev/dice` (and `/recipes`) |
| ChatGPT | the same addresses |

## 1. The starting point

We had three servers, one file each in `servers/`, over a shared `mcp.ts`.
Claude Code ran them over stdio: it starts the program and talks to it through
stdin and stdout. Each file could also run as a web server with `deno serve`,
but only on `localhost`.

## 2. The key idea: a URL, not an install

claude.ai, ChatGPT and Gemini run in the cloud. They can't start a program on
your Mac, and their `localhost` is their own machine. Nothing gets installed
into them: you give them a **public HTTPS address**, and their servers send
MCP requests to it whenever the model wants a tool. So we needed our servers
running somewhere the internet could reach.

## 3. All servers at one address

`serve-all.ts` (later `hosts/deno/serve.ts`) put every server on one port,
each under its own path: `/dice`, `/hello`, `/recipes`. The bare address lists
them. That gave us one address to publish, with a path per server.

## 4. A public address from the Mac: a Cloudflare tunnel

`cloudflared` connects **out** from your Mac to Cloudflare, which hands back a
public `https://….trycloudflare.com` address and passes requests down the
connection to `localhost:8000`. No router or firewall changes are needed. The
details are in [remote.md](remote.md).

Three snags, and what fixed them:

| Snag | Fix |
| --- | --- |
| `brew install cloudflared` failed: macOS 14 gets no ready-built packages, and the Command Line Tools were too old to build one | Cloudflare's own ready-built download, put in `~/.local/bin` |
| The download broke off with an HTTP/2 error | `curl --http1.1 -C -` to resume it |
| The tunnel dropped every minute or two (`QUIC stream: timeout`) | `--protocol http2`, over TCP instead of UDP |

Homebrew's huge output on the way was only its catalog of new packages, after
a long-overdue update. Nothing in it was installed.

## 5. claude.ai

**Customize → Connectors → Add custom connector**, one per server, with no
sign in. Both showed a ✓. "What recipes do you have?" went through our
server ("Used recipes integration").

The dice taught a lesson. "Roll 3d6 and flip a coin" showed "Ran a command"
and no permission prompt: Claude rolled the dice itself, in its own code
sandbox. "Use the dice tool to roll 3d6" asked permission first, then came from
our server. For simple jobs, a model may skip a tool; a tool earns its place
by doing what the model can't do alone.

The connector page also listed our tools under **Read-only tools**: the
`readOnly: true` in our server files reaches claude.ai as MCP's
`readOnlyHint`.

## 6. Docs, commits and a GitHub repo

We wrote [remote.md](remote.md), updated the online Claude Doc, committed the
work, and created the public repo
[github.com/backspaces/MCP](https://github.com/backspaces/MCP). Work happened
on branches, each merged into `main` once tested.

## 7. Restructure: one folder per host

We expected more than one host (Cloudflare, Val Town, maybe Simtable's own),
so we made the rule: **nothing outside `hosts/` knows where it runs.**

- `mcp.ts` and the servers use only web standards.
- `servers.ts` lists the servers, since a host like Cloudflare has no folder to
  scan.
- `mount()` in `mcp.ts` routes `/dice`, `/hello`, `/recipes`, the same on every
  host.
- Each host gets `hosts/<host>/`, with a three-line entry file
  (`export default mount(servers)`) and its own settings.
- Imports use bare package names, from `package.json`. Deno reads them through
  its own cache (`"nodeModulesDir": "none"` in `deno.json`), so Claude Code
  still needs no `npm install`; Node and Cloudflare's build read
  `node_modules`.
- The `--stdio` check works under Deno or Node and loads the stdio code only
  when it's used.

The servers, `.mcp.json` and Claude Code didn't change.

## 8. Cloudflare Workers: the lasting home

Workers runs our code on Cloudflare's network, at a fixed address, with
nothing running on the Mac. A Worker is a fetch handler, the shape `mcp.ts`
already makes, so `hosts/cloudflare/worker.ts` is three lines. The details are
in [hosts/cloudflare/README.md](../hosts/cloudflare/README.md).

- **Wrangler**, Cloudflare's tool, wants Node 22, and the Mac has 20.9. It runs
  fine through Deno, so `deno task cf …` wraps it and no Node upgrade was
  needed.
- We first ran it locally on Cloudflare's real runtime, `workerd`
  (`deno task cf:dev`), to check that the MCP library works there. It did.
- `deno task cf login` failed the first time: Wrangler waits only a few
  minutes for **Authorize**. The second try, clicked straight away, worked.
- `deno task cf:deploy` registered the `backspaces.workers.dev` subdomain and
  published. The address answered after about 90 seconds of DNS setup.

## 9. ChatGPT

On a Plus account: **Plugins → Add → Add custom MCP server**, with
**No authentication** (OAuth, the default, would look for a sign-in we don't
have). "Use the dice tool to roll 3d6" showed "@ Rolled three six-sided dice",
and `deno task cf:tail` showed `POST https://mcp.backspaces.workers.dev/dice -
Ok` arrive as ChatGPT rolled again.

## The commands

Run from the repo root; `deno task` with no name lists them.

| Command | When |
| --- | --- |
| `deno task serve` | try every server locally at http://localhost:8000 |
| `deno task cf:dev` | try them on Cloudflare's runtime locally, at http://localhost:8787 |
| `deno task cf:deploy` | publish; the address stays the same |
| `deno task cf:tail` | watch live requests |
| `deno task cf login` | once per Mac; click Authorize straight away |
| `deno task cf deployments list` / `rollback` | see past deploys, or undo the last |
| `cloudflared tunnel --protocol http2 --url http://localhost:8000` | a temporary public address for `deno task serve` |

To add a server: copy `servers/hello.ts`, add a line to `servers.ts`, then
`deno task cf:deploy`. It appears at `/<name>`; add it as a connector.

## Still open

- **Gemini**: custom connectors were reported rolling out to US personal
  accounts in mid-2026; not tried yet.
- **More hosts**: Val Town, or Simtable's, each as a new `hosts/` folder.
- **Logins**: our servers are open to anyone with the address, fine for dice
  and recipes. Anything private needs OAuth first.
