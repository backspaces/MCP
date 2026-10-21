# How mcp.ts works

A server file like [recipes.ts](../servers/recipes.ts) is just a description: names,
descriptions and `run` functions. [mcp.ts](../mcp.ts) turns that description into a
working MCP server, and the same file can talk two ways, over HTTP or over stdio.
For a line-by-line walk through mcp.ts, see [mcp-ts.md](mcp-ts.md).

## One description, one factory

`mcpServer({ name, tools, resources, prompts })` builds a `makeServer` function
([mcp.ts:64](../mcp.ts#L64)). Each call makes a fresh `McpServer` from the official
SDK and registers every tool, resource and prompt on it. The rest of the file
decides how requests reach it.

## Over HTTP: `deno serve`

```
deno serve -A servers/recipes.ts
```

`deno serve` opens port 8000 (its default), loads `recipes.ts`, and takes its `export default`,
which is `{ fetch }`. From then on, for every HTTP request that arrives, Deno calls
`fetch(request)` and sends back the `Response` it returns. Our code never opens a
port; it only supplies that one function.

`fetch` is a fork in the road ([mcp.ts:113-116](../mcp.ts#L113-L116)):

```
                    request on port 8000
                            │
                         fetch()
                            │
        GET, not asking for an event stream?
              │                        │
             yes                       no
       (a browser)            (an MCP client: Claude Code, curl, …)
              │                        │
           note()               handler.fetch()
              │                 the MCP SDK: reads the JSON-RPC
              │                 message, calls your run/read,
              │                 returns the JSON-RPC reply
              │                        ▲
              └──── ask() ─────────────┘
               fake POSTs: tools/list, resources/list,
               resources/templates/list, prompts/list
```

- **An MCP client** such as Claude Code sends `POST` requests whose body is a
  JSON-RPC message, like `{"method":"tools/call", …}`. These go to
  `handler.fetch`, made by the SDK's `createMcpHandler(makeServer)`
  ([mcp.ts:109](../mcp.ts#L109)), which does all the protocol work.
- **A browser** sends a plain `GET`. That goes to `note()`
  ([mcp.ts:159](../mcp.ts#L159)), which replies with a plain-text page describing
  the server. Chrome wraps plain text in `<html><body><pre>` to display it; that
  markup isn't from us.

## The page is built by an MCP client

`note()` doesn't read the `tools` or `resources` objects. It asks the server, the
way any client would. `ask()` ([mcp.ts:148](../mcp.ts#L148)) builds a `Request` by
hand, a `POST` with a JSON-RPC body such as `{"method":"tools/list"}`, and passes it
straight to `handler.fetch`, with no network involved. It reads the reply and
returns the list.

So the page shows exactly what Claude would see. If a tool failed to register, it
would be missing from the page too.

The "Add it to Claude Code" line at the bottom is only text. The page doesn't run
it. In this repo [.mcp.json](../.mcp.json) already adds the servers over stdio, so
use another name, such as `recipes-http`, if you add the HTTP one as well.

## Over stdio: `deno run … --stdio`

```
deno run -A servers/recipes.ts --stdio
```

`deno run` just runs the file; nothing listens on a port. When `mcp.ts` sees
`--stdio` in the program's arguments ([mcp.ts:104-107](../mcp.ts#L104-L107)), it loads the
SDK's `serveStdio` and hands it the same `makeServer`, which reads one JSON-RPC message per line
from stdin and writes each reply as a line on stdout. This is how Claude Code runs
our servers from `.mcp.json`.

Without `--stdio`, `deno run` loads the file, sees the `export default { fetch }`,
prints a warning on stderr, and exits, because nothing called `fetch`.

## Side by side

| | Over HTTP | Over stdio |
| --- | --- | --- |
| Started by | you, with `deno serve` | the client, with `deno run … --stdio` |
| Requests arrive as | HTTP `POST`s on a port | lines on stdin |
| Replies leave as | HTTP responses | lines on stdout |
| Handled by | `createMcpHandler(makeServer)` | `serveStdio(makeServer)` |
| Browser page | yes, via `note()` | no |
| Your `run` / `read` code | the same | the same |

Only the delivery differs. Your tools, resources and prompts are written once and
can't tell which way they were called.
