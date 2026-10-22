# mcp.ts, piece by piece

[mcp.ts](../mcp.ts) is 187 lines. It takes a plain description of a server and hands
it to the official MCP SDK, so a server file never touches the SDK itself. This walk
goes top to bottom; read it with `mcp.ts` open beside it.
[how-it-works.md](how-it-works.md) has the big picture: how requests arrive over HTTP
and over stdio.

The file has six parts:

| Lines | Part | Job |
| --- | --- | --- |
| [1–26](../mcp.ts#L1-L26) | header and imports | what the SDK provides |
| [28–45](../mcp.ts#L28-L45) | three small helpers | reshape things into MCP's formats |
| [47–100](../mcp.ts#L47-L100) | `mcpServer` and `makeServer` | turn your objects into SDK calls |
| [102–119](../mcp.ts#L102-L119) | stdio switch and `fetch` | how requests get in |
| [121–144](../mcp.ts#L121-L144) | `mount` and `publicUrl` | several servers at one address |
| [146–187](../mcp.ts#L146-L187) | `ask` and `note` | the browser page |

## 1. Imports (lines 19–26)

```ts
import { createMcpHandler, McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

export { z };
```

- **`McpServer`** is the SDK's server object. You register tools, resources and
  prompts on it, and it answers the protocol messages about them.
- **`ResourceTemplate`** describes a resource URI with blanks, like `recipe://{name}`.
- **`createMcpHandler`** wraps a server in a web `fetch` handler: a Request goes in,
  a Response comes out. This is the HTTP side.
- **`serveStdio`**, the stdio side, connects a server to stdin and stdout. It isn't
  imported here: it's loaded only when `--stdio` is given (part 4).
- **`z`** is [Zod](https://zod.dev), a library for describing data shapes such as
  `z.string().min(1)`. MCP needs a schema for every tool's arguments, and the SDK
  takes Zod. `export { z }` lets a server file write
  `import { mcpServer, z } from "../mcp.ts"` and never import Zod itself.

Each import is a package name from the npm registry:

```
@modelcontextprotocol/server/stdio
└─────────┬─────────┘└──┬─┘└─┬─┘
        scope      package  subpath
```

- **`@modelcontextprotocol`** is the scope, a namespace only the MCP project can
  publish under. `zod` has no scope.
- **`/stdio`** and **`/v4`** are subpaths: separate entry points inside a package,
  so code that doesn't use stdio doesn't load it.
- **The versions** are in [package.json](../package.json): `^2.3.0` means 2.3.0 or
  any later 2.x. The lock file pins the exact one.

The names are bare, with no version or `npm:` prefix, so the same lines work on
every host:

- **Deno** reads `package.json` and, because [deno.json](../deno.json) sets
  `"nodeModulesDir": "none"`, downloads the packages into its own cache. There's
  no `npm install` and no `node_modules`.
- **Node and Cloudflare's build tool** find them in `node_modules`, which
  `npm install` fills.

Deno also has its own form, `npm:zod@4/v4`, which we used at first. Only Deno
understands it.

## 2. Three helpers (lines 28–45)

```ts
const hints = ({ readOnly, destructive }) => ({
  ...(readOnly !== undefined && { readOnlyHint: readOnly }),
  ...(destructive !== undefined && { destructiveHint: destructive }),
});
```

Renames our short `readOnly` and `destructive` to MCP's official names,
`readOnlyHint` and `destructiveHint`. Clients use these hints to decide which tools
need permission first. The `...(cond && {…})` trick adds a field only when it's
set: spreading `false` adds nothing.

```ts
const text = (s) => ({ content: [{ type: "text", text: s }] });
```

MCP tool results aren't plain strings. They're a list of content items, because a
tool could also return images. This wraps a string in that shape.

```ts
const safely = (run) => async (args) => {
  try {
    return text(String(await run(args)));
  } catch (e) {
    return { ...text(e.message ?? String(e)), isError: true };
  }
};
```

Wraps your `run` function. Success: its string becomes a tool result. A throw: the
error message becomes a result marked `isError: true`. The model then reads
"No recipe called 'tacos'" and can try something else, instead of the whole call
failing. `await` means `run` may be a normal function or an `async` one.

## 3. `mcpServer` and `makeServer` (lines 47–100)

Lines 41–56 are a comment giving the shape of the object you pass in. Then:

```ts
export function mcpServer({ name, tools = {}, resources = {}, prompts = {} }) {
  const makeServer = () => {
    const server = new McpServer({ name, version: "1.0.0" });
    // …register everything…
    return server;
  };
```

`makeServer` is a **factory**: a function that builds a fresh, fully registered
server each time it's called. The SDK gets the factory rather than one server,
so it can make a new one whenever it needs one.

### Tools (lines 67–73)

```ts
for (const [toolName, tool] of Object.entries(tools)) {
  server.registerTool(toolName, {
    annotations: hints(tool),
    description: tool.description,
    inputSchema: z.object(tool.args ?? {}),
  }, safely(tool.run));
}
```

One `registerTool` per entry in `tools`. Take `search_recipes` from
[recipes.ts](../servers/recipes.ts):

| You write | Becomes |
| --- | --- |
| the key `search_recipes` | the tool's name |
| `description: "Find recipes…"` | the text the model reads to decide when to call it |
| `readOnly: true` | `annotations: { readOnlyHint: true }` |
| `args: { word: z.string().min(1) }` | `inputSchema: z.object({ word: … })` |
| `run: ({ word }) => …` | the handler, wrapped in `safely` |

The schema does two jobs. The SDK turns it into JSON Schema for `tools/list`, which
is how Claude learns the tool takes a `word`. It also checks incoming arguments, so
`run` never sees a missing or empty `word`.

### Resources (lines 75–88)

```ts
const meta = { description: res.description, mimeType: res.mimeType ?? "text/plain" };
const contents = (uri, s) => ({ contents: [{ uri: uri.href, mimeType: meta.mimeType, text: s }] });
```

`contents` wraps your `read` string in MCP's resource-result shape. The SDK passes
the URI as a `URL` object, so `uri.href` turns it back into the string.

Then two cases, decided by whether the URI has a `{`:

- **A template** (`recipe://{name}`): `new ResourceTemplate(res.uri, { list })`. When
  a client reads `recipe://pancakes`, the SDK matches it to the template and calls
  `read` with `{ name: "pancakes" }`. Your `list()` returns the concrete URIs, which
  is how the `@` menu knows about pancakes, guacamole and omelette.
- **A plain URI** (`recipe://index`): registered as it is, and `read` gets nothing.

### Prompts (lines 90–97)

```ts
server.registerPrompt(promptName, {
  description: prompt.description,
  ...(prompt.args && { argsSchema: z.object(prompt.args) }),
}, async (args) => ({
  messages: [{ role: "user", content: { type: "text", text: await prompt.run(args ?? {}) } }],
}));
```

A prompt's result is a list of chat messages. Ours is always one user message: the
text your `run` returns. That's why `/mcp__recipes__plan_meal 6` in the terminal (or
`/recipes:plan_meal` in VS Code, with 6 filled in) makes "Plan a meal for 6
people…" appear as if you had typed it.

## 4. How requests get in (lines 102–119)

```ts
const args = globalThis.Deno?.args ?? globalThis.process?.argv?.slice(2) ?? [];
if (args.includes("--stdio")) {
  import("@modelcontextprotocol/server/stdio").then(({ serveStdio }) => serveStdio(makeServer));
}
```

Run with `--stdio`, and the SDK reads requests from stdin and writes replies to
stdout. The process then stays alive, waiting for the next line.

The first line finds the program's arguments wherever it runs: `Deno.args` under
Deno, `process.argv` under Node (minus its first two entries, the node program
and the script). Cloudflare and other web hosts have no arguments, so the answer
is an empty list. `?.` stops at whatever doesn't exist instead of failing.

`import(…)` with parentheses loads a module while the program runs, rather than
before. So the stdio code, which web hosts can't use, is loaded only when it's
needed.

```ts
const handler = createMcpHandler(makeServer);

const fetch = (req) =>
  req.method === "GET" && !req.headers.get("accept")?.includes("text/event-stream")
    ? note(handler, name, publicUrl(req))
    : handler.fetch(req);

return { fetch };
```

`handler` is the SDK's HTTP side. `fetch` adds one fork: a browser's GET goes to
`note()` for the text page, and everything else goes to the SDK.

Why the `accept` check? MCP clients may also send a GET, to open a stream for
server messages, and they say so with `accept: text/event-stream`. A browser never
does.

`return { fetch }` is what `export default mcpServer(…)` exports. `deno serve`
looks for exactly that shape and calls `fetch` for every request.

This part runs even under stdio. It's harmless: it only builds a function that
nothing calls. It's also why Deno warns about `export default { fetch }`.

## 5. Several servers at one address (lines 121–144)

```ts
export function mount(servers) {
  return {
    fetch(req) {
      const server = servers[new URL(req.url).pathname.split("/")[1]];
      if (server) return server.fetch(req);
      // … otherwise a page listing each server's address
    },
  };
}
```

`mount({ dice, recipes })` is one `{ fetch }` for several servers. The first part of
the path picks the server: `/dice` goes to dice, `/recipes/…` to recipes. Anything
else gets a page listing them. Every host serves [servers.ts](../servers.ts) through
it, so `/dice` means the same everywhere.

`publicUrl(req)` is the address the caller used, for showing on pages. Behind a
tunnel or proxy, a request reaches us as plain http even when the caller used
https; the proxy says which in the `x-forwarded-proto` header, and `publicUrl`
puts it back.

## 6. The browser page (lines 146–187)

```ts
async function ask(handler, method) {
  const res = await handler.fetch(new Request("http://localhost/", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method }),
  }));
  const body = await res.text();
  const json = JSON.parse(body.match(/^data: (.*)$/m)?.[1] ?? body);
  return json.result ?? {};
}
```

`ask` is a tiny MCP client. It builds the same POST that curl sends and passes it
straight to `handler.fetch`, so no network is involved; the URL is never used. The
SDK may reply in **event-stream** format (`event: message` then `data: {…}`, which
is what your curl output showed) or as plain JSON. The regex pulls out the `data:`
line if there is one, otherwise the whole body is parsed.

```ts
async function note(handler, name, url) {
  const [{ tools = [] }, { resources = [] }, { resourceTemplates = [] }, { prompts = [] }] =
    await Promise.all(["tools/list", "resources/list", "resources/templates/list", "prompts/list"]
      .map((m) => ask(handler, m)));
  // …
  return new Response(`${name}: an MCP server …`);
}
```

`note` asks all four lists at once (`Promise.all`), then formats them:

- `section(title, items)` prints a heading and indented lines, or nothing if the
  list is empty. That's why hello's page has no Resources or Prompts section.
- `args(list)` prints `(word)` or `(guests, notes)` after a name.
- `url` comes from the request, so the "Add it to Claude Code" line shows whatever
  address you actually used.

The reply is a plain-text `Response`. Chrome displays it inside a `<pre>` it adds
itself.

## The whole trip, for one tool call

Claude Code calls `search_recipes` with `{"word": "lime"}` over stdio:

1. Claude Code writes `{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"search_recipes","arguments":{"word":"lime"}}}` to the server's stdin.
2. `serveStdio` reads the line and gives it to an `McpServer` from `makeServer`.
3. The SDK finds `search_recipes`, checks `{word: "lime"}` against `z.object({ word: z.string().min(1) })`, and calls the `safely` wrapper.
4. `safely` calls your `run`, which returns the guacamole recipe as a string.
5. `text()` wraps it: `{ content: [{ type: "text", text: "guacamole (serves 4)…" }] }`.
6. The SDK writes `{"jsonrpc":"2.0","id":7,"result":{"content":[…]}}` to stdout, and Claude Code reads it.

Over HTTP the trip is the same, except steps 1, 2 and 6 go through `deno serve`,
`fetch` and `handler.fetch` instead of stdin and stdout.
