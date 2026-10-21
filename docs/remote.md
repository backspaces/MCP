# Reaching Our Servers From the Web

Oct 21, 2026 · Owen Densmore

claude.ai, ChatGPT and Gemini run in the cloud, so they can't start our
servers the way Claude Code does. They need a public HTTPS address that
reaches a running server. This page covers how we got one from a Mac with a
Cloudflare tunnel, and what we learned along the way.

## Nothing is installed into the AI app

The AI app doesn't download or install our server. It keeps the address, and
each time the model wants a tool, the app's own servers send an MCP request to
that address. So:

- the server has to be running, and reachable from the internet, whenever
  someone chats;
- `localhost` can never work, since localhost to Anthropic's servers is
  Anthropic's machine, not yours.

Claude Code is unchanged by all this. It still starts each server itself
over stdio, from [.mcp.json](../.mcp.json).

## One file, every server: serve-all.ts

Each server file already works as a web server (`deno serve -A
servers/dice.ts`), but that's one server per port.
[serve-all.ts](../serve-all.ts) puts every file in `servers/` on one port,
each under its own path:

| Path | Server |
| --- | --- |
| `/` | a plain list of the servers' addresses |
| `/dice` | dice |
| `/hello` | hello |
| `/recipes` | recipes |

A new file in `servers/` shows up by itself. Opening `/dice` in a browser
shows that server's info page, and MCP requests to `/dice` go to the dice
server.

## What cloudflared does

`cloudflared` is Cloudflare's connector program (the *d* is for *daemon*, a
background program). It gives a server on your Mac a public HTTPS address
without changing your router, firewall or certificates.

```
claude.ai ──https──▶ Cloudflare ◀══tunnel══ cloudflared (your Mac) ──http──▶ deno on :8000
```

1. `cloudflared` opens a connection **out** from your Mac to Cloudflare. It's
   an ordinary outgoing connection, like a browser's, so nothing blocks it.
2. Cloudflare hands out a public address, such as
   `https://baking-expect-matter-domestic.trycloudflare.com`, and does the
   HTTPS part.
3. A request to that address travels back down the tunnel, and `cloudflared`
   passes it to Deno on port 8000 as plain http. The reply goes back the same
   way.

Because the request reaches Deno as http, Cloudflare adds the header
`x-forwarded-proto: https`. `publicUrl` in [mcp.ts](../mcp.ts) reads it, so
the pages show `https://` addresses.

### Quick tunnels and named tunnels

| | Quick tunnel (what we used) | Named tunnel |
| --- | --- | --- |
| Command | `cloudflared tunnel --url …` | `cloudflared tunnel login`, `create`, `route dns`, `run` |
| Account | none: anonymous | your Cloudflare account |
| Address | random `….trycloudflare.com`, new every run | fixed, e.g. `mcp.yourdomain.com` |
| Needs | nothing | a domain managed in Cloudflare |
| Good for | trying things out | daily use from your own Mac |

Either way, the address works only while your Mac is awake and both programs
are running. For always-on, the servers need a host (still to be decided).

## The steps we took

### 1. Install cloudflared

`brew install cloudflared` failed on macOS 14. Homebrew no longer ships
ready-built packages for it, so it tried to build from source, and then
stopped because the Command Line Tools were too old. We skipped Homebrew and
used Cloudflare's own ready-built program:

```sh
curl --http1.1 -fL -C - -o cloudflared.tgz \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz
tar -xzf cloudflared.tgz
mv cloudflared ~/.local/bin/       # any folder on your PATH
cloudflared --version
```

`--http1.1 -C -` is there because the first download broke off partway with
an HTTP/2 error. `-C -` resumes where it stopped. `codesign -dv
~/.local/bin/cloudflared` shows Cloudflare's signature (team `68WVV388M8`).

Homebrew's long output beforehand was its catalog of new packages, printed
after a long-overdue self-update. Nothing in it was installed.

### 2. Start the servers and the tunnel

Two terminals, both left running. Stop anything else on port 8000 first.

```sh
deno serve -A serve-all.ts                                  # terminal A
cloudflared tunnel --protocol http2 --url http://localhost:8000    # terminal B
```

Terminal B prints a box with the public address. Open it in a browser: you
should see the list of servers.

**Use `--protocol http2`.** The default protocol, QUIC, runs over UDP, and
our home network dropped quiet UDP connections every minute or two. The log
filled with `failed to accept QUIC stream: timeout: no recent network
activity`, and the tunnel was down for up to 50 seconds before reconnecting.
`http2` runs over TCP, like a browser, and stayed up.

### 3. Check it from outside

A real MCP call through the public address:

```sh
curl -s https://<your-address>/dice \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"flip_coin","arguments":{}}}'
```

It should answer with `heads` or `tails`.

### 4. Add the connectors to claude.ai

**Customize → Connectors → + Add → Add custom connector**, one per server:

| Name | URL |
| --- | --- |
| dice | `https://<your-address>/dice` |
| recipes | `https://<your-address>/recipes` |

Choose no sign in. The bare address (no `/dice`) is only the list page, not
an MCP server, so it won't work as a connector. Each connector showed a ✓ once
claude.ai had reached it. The first recipes attempt failed and worked on
reconnecting, perhaps during a tunnel drop.

Each connector's page lists its tools. Ours appear under **Read-only tools**
because of `readOnly: true` in the server files, sent as MCP's
`readOnlyHint`.

### 5. Use them in a chat

- "What recipes do you have?" → **Used recipes integration**. 
- "Roll 3d6 and flip a coin" → **Ran a command**, with no permission prompt.
  Claude rolled the dice itself with code in its own sandbox and never called
  our server. The tools were set to **Needs approval**, so a real call would
  have asked first.
- "Use the dice tool to roll 3d6" → a permission prompt, then *You rolled 17
  on 3d6 (6, 5, 6)*. That one came from our server.

For simple jobs Claude may skip a tool and do the work itself. A tool earns
its place when it does something Claude can't do alone, such as reaching
your data or another service.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Connector won't connect | Tunnel or deno not running, Mac asleep, or the URL is missing `/dice` |
| Worked yesterday, not today | A quick tunnel's address changes every run: remove the connector and add the new one |
| `QUIC stream: timeout` in the tunnel log | Restart with `--protocol http2` |
| `address already in use` from deno | Something else is on port 8000, e.g. an earlier `deno serve` |
| Claude answers without using the tool | Ask for the tool by name, and check it's switched on under **+ → Connectors** |

## Safety

With no sign in, anyone who finds the address can call the servers while the
tunnel runs. That's fine for dice and recipes. Anything private needs a login
(OAuth) before it goes online.

## Next

- ChatGPT: Settings → Apps & Connectors → Advanced → Developer mode, then the
  same addresses. It mostly uses tools; resources and prompts are mostly
  ignored.
- Gemini: custom connectors were reported rolling out to US personal
  accounts in mid-2026, not yet confirmed here.
- An always-on host, so none of this depends on the Mac.
