# MCP

Small MCP servers to copy from. Each is one file in [servers/](servers/), and
[mcp.ts](mcp.ts) does the MCP part, so a server file is just what it offers.

MCP is not an AI. An MCP server adds abilities to an AI app you already use
(Claude, Codex, ChatGPT, …): the app is the client, and it calls the server.

## The three things a server can offer

| Kind | Who uses it | What it's for | Claude Code in the terminal | Claude Code in VS Code |
| --- | --- | --- | --- | --- |
| **Tools** | the model, when it decides to | do something or look something up | used automatically | used automatically |
| **Resources** | you (or the app) attach them | read-only data, each at a URI | type `@recipes:` and pick one | ask: "read recipe://pancakes" |
| **Prompts** | you pick them | canned instructions with blanks | `/mcp__recipes__plan_meal` | `/recipes:plan_meal (MCP)` |

The two spell a prompt differently. The terminal's name is `mcp__`, the server's
name, `__`, then the prompt's name: `/mcp__recipes__plan_meal`. VS Code shows the
same prompt as `/recipes:plan_meal`. In VS Code, pick it from the `/` menu and
fill in the blanks when asked; typed on one line with its arguments, it doesn't
run. VS Code's `@` lists only workspace files, not resources, so there you ask
Claude to read one instead.

Tools are the main event. Many apps support only tools, so treat resources and
prompts as extras.

## The servers

- [hello.ts](servers/hello.ts) has one tool, `greet`. It's the minimal template.
- [dice.ts](servers/dice.ts) has two tools, `roll_dice` and `flip_coin`, with
  arguments that have limits and defaults.
- [recipes.ts](servers/recipes.ts) offers all three kinds over a few recipes:
  - the tool `search_recipes`
  - the resources `recipe://index` and `recipe://{name}`
  - the prompt `plan_meal`

## Running one in Claude Code

Claude Code (the `claude` CLI, and the Claude Code panel in VS Code) starts the
servers itself over stdio. Nothing is left running, and there's nothing to host.
All three are listed in [.mcp.json](.mcp.json), so starting Claude Code in this
repo picks them up, after a one-time approval. To add a new one, run this from the repo:

    claude mcp add --scope project dice -- deno run -A ./servers/dice.ts --stdio

| Part | Read by | Meaning |
| --- | --- | --- |
| `claude mcp add` | Claude Code | add a server to its list |
| `--scope project` | Claude Code | save it in `.mcp.json` here (the default, `local`, is private to you) |
| *(no `--transport`)* | Claude Code | stdio is the default: Claude Code starts the program itself |
| `dice` | Claude Code | the server's name, as in `/mcp` and `mcp__dice__roll_dice` |
| `--` | Claude Code | the rest is the server's command, so `-A` isn't read as a `claude` option |
| `deno run -A` | Deno | run a script, allowing network, files and env |
| `./servers/dice.ts` | Deno | the script, relative to where Claude Code started, so only inside this repo |
| `--stdio` | `mcp.ts` | talk over stdin/stdout; required, since without it the file only exports a web handler and exits |

Everything after `--` becomes the entry's `command` and `args` in `.mcp.json`.

stdio means standard input and output, the two pipes every program has. The
app writes JSON requests into the server's stdin and reads replies from its
stdout, one message per line. A third pipe, stderr, is for logs and errors,
which the app ignores. That's why Deno's warning `Detected export default
{ fetch }, did you mean to run "deno serve"?` is harmless: it goes to stderr.

**Over HTTP (optional)**: the same file is also a web server, which is handy
for looking at it from a browser or curl:

    deno serve -A servers/recipes.ts

Open http://localhost:8000/ to see what the server offers. The page is built
live from the server's own lists. [docs/how-it-works.md](docs/how-it-works.md)
explains how one file serves both the page and MCP, and stdio too;
[docs/mcp-ts.md](docs/mcp-ts.md) walks through mcp.ts piece by piece. Apps that live in the cloud, like claude.ai,
need a public URL rather than localhost; [docs/claude-app.md](docs/claude-app.md)
covers that, along with Claude Desktop and the `claude mcp` commands.

**From the web**: `deno serve -A hosts/deno/serve.ts` runs every server on one
port, at `/dice`, `/hello` and `/recipes`. A Cloudflare tunnel gives that a public
HTTPS address, which claude.ai and ChatGPT can use as a connector.
[docs/remote.md](docs/remote.md) has the steps, how the tunnel works, and
what went wrong along the way.

## Layout

```
servers/        what each server offers, one file each
servers.ts      the list of servers the web hosts serve
mcp.ts          turns a server file into MCP over HTTP or stdio
hosts/<host>/   everything particular to one place the servers run
docs/
```

Nothing outside `hosts/` knows where it runs: the servers and `mcp.ts` use only
web standards. Each host's folder holds its entry file and its own settings.
Today there are two:

- [hosts/deno/](hosts/deno/): `deno serve` on any machine, such as your Mac behind
  a tunnel (`deno task serve`).
- [hosts/cloudflare/](hosts/cloudflare/): Cloudflare Workers, at a fixed
  `workers.dev` address. Its README explains Cloudflare and the steps.

Dependencies are in [package.json](package.json), which Deno, Node and
Cloudflare's build tool all read. Deno needs no `npm install`; the others do.

## Commands

Shortcuts live under `tasks` in [deno.json](deno.json); `deno task` with no name
lists them. Run them from the repo root.

| Command | What it does |
| --- | --- |
| `deno task serve` | every server on http://localhost:8000, at `/dice`, `/hello`, `/recipes` |
| `deno task cf:dev` | the same on Cloudflare's runtime, locally, at http://localhost:8787 |
| `deno task cf:deploy` | publish to https://mcp.backspaces.workers.dev; same address every time |
| `deno task cf:tail` | watch requests to the live Worker as they arrive (Ctrl-C stops) |
| `deno task cf <command>` | any other Wrangler command, below |

`deno task cf` is Cloudflare's tool, Wrangler, run through Deno with our
settings, so `deno task cf whoami` is `wrangler whoami`. The useful ones:

| Command | What it does |
| --- | --- |
| `deno task cf login` / `logout` | sign Wrangler in to your Cloudflare account, or out |
| `deno task cf whoami` | which account Wrangler is using |
| `deno task cf deployments list` | the last 10 deploys, with dates and version ids |
| `deno task cf rollback` | go back to the previous deploy (or name a version id) |
| `deno task cf delete` | remove the Worker and its address |
| `deno task cf --help` | everything else |

The Cloudflare commands need `npm install` once first;
[hosts/cloudflare/README.md](hosts/cloudflare/README.md) has the details.
Claude Code needs no command: it starts the servers itself from `.mcp.json`.

The whole story of how this came together is in
[docs/walkthrough.md](docs/walkthrough.md).

## Making a new server

Copy `hello.ts`, add a line for it to [servers.ts](servers.ts), and fill in:

```ts
export default mcpServer({
  name: "hello",
  tools: {
    greet: {
      description: "Say hello to someone by name.",  // the model reads this to decide when to call it
      readOnly: true,                                 // hint: safe to call without asking
      args: { name: z.string().describe("Who to greet") },
      run: ({ name }) => `Hello, ${name}!`,           // return a string; a throw becomes an error the model reads
    },
  },
  resources: { /* name: { uri, description, list?, read } */ },
  prompts:   { /* name: { description, args?, run } */ },
});
```

[recipes.ts](servers/recipes.ts) shows resources and prompts. The comments in
[mcp.ts](mcp.ts) give every field.

## Trying one by hand

Over stdio, a server reads one JSON message per line, and it needs `initialize` first:

```sh
printf '%s\n' \
  '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"me","version":"1"}}}' \
  '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"roll_dice","arguments":{"count":3}}}' \
  | deno run -A servers/dice.ts --stdio
```

Over HTTP, no `initialize` is needed:

```sh
curl -s localhost:8000/ -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri":"recipe://pancakes"}}'
```
