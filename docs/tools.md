# Tools for Testing MCP Servers

Oct 26, 2026 · Owen Densmore

When a server doesn't behave, the first question is whether the fault is
in the server or in the app using it. These tools talk to a server
directly, without an AI in between, or watch the traffic between the two.

| Tool | What it's for | Install |
| --- | --- | --- |
| [MCP Inspector](#mcp-inspector) | try every tool, resource and prompt in a web page | `npx`, nothing to install |
| [Claude Code's own](#claude-codes-own-checks) | is the server connected, and why not | built in |
| [curl](#curl) | one exact request, by hand | built into macOS |
| [deno task cf:tail](#the-workers-live-log) | see each request reach the live Worker | in this repo |
| [mcpc](#mcpc) | an MCP client on the command line, for scripts | `brew install mcpc` |
| [mcpsnoop](#mcpsnoop) | watch the messages between an app and a server | `brew install mcpsnoop` |
| [mcp-remote](#mcp-remote) | let a stdio-only app use a server at a URL | `npx mcp-remote` |

The `npx` tools need Node 22 or later. The Homebrew ones build from source
on macOS 14, so they install slowly there.

## MCP Inspector

The official tool from the MCP project: DevTools for an MCP server. It's
an MCP client with a web page in front.

```sh
# a local server: the Inspector starts it over stdio, as Claude Code would
npx @modelcontextprotocol/inspector deno run -A servers/dice.ts --stdio

# the live one: start the Inspector, then connect over Streamable HTTP
# to https://mcp.backspaces.workers.dev/dice
npx @modelcontextprotocol/inspector
```

It opens a page, usually at `http://localhost:6274`, with a one-time token
in its address. In it:

- **Tools**: each tool's description and an argument form. Run one and see
  the exact result, `isError` included.
- **Resources**: list them, read `recipe://pancakes`.
- **Prompts**: fill in `plan_meal`'s blanks and see the message it makes.
- **History**: every JSON-RPC request and reply, the same messages
  [the curl examples](#curl) send by hand.

If the Inspector works and an app doesn't, look at the app's side: the
connector's URL, whether it's switched on, its permissions. Version 2 is
recent; `npx @modelcontextprotocol/inspector --help` shows its exact
options.

## Claude Code's own checks

| Command | Shows |
| --- | --- |
| `claude mcp list` | every server Claude Code knows here, and whether it connects |
| `claude mcp get dice` | one server's settings: its command or URL, its scope |
| `/mcp`, inside a session | each server's status, with reconnect and enable buttons |
| `claude --debug=mcp` | Claude Code's log of starting and talking to servers; why one failed |

"Unknown command" for a prompt, or a server missing from `/mcp`, usually
means it isn't connected yet or was declined; see the README's note on
prompts.

## curl

The most direct check: one request, nothing in between. The README's
"Trying one by hand" shows stdio and HTTP. Against the live Worker:

```sh
curl -sS https://mcp.backspaces.workers.dev/dice \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"roll_dice","arguments":{"count":3}}}'
```

Change the `method` to `tools/list`, `resources/list` or `prompts/list` to
see what a server offers.

## The Worker's live log

```sh
deno task cf:tail
```

Each request to the live Worker as it arrives:
`POST https://mcp.backspaces.workers.dev/dice - Ok`. It proves an app's
call reached the server; with no line, the request never left the app.
[hosts/cloudflare/README.md](../hosts/cloudflare/README.md) has more.

## mcpc

A general MCP client for the terminal, from Apify: connect to a server,
list and call its tools, read resources. Where the Inspector is for
clicking around, mcpc is for typing commands and for scripts.
`mcpc --help` shows how it names servers and calls tools.
[github.com/apify/mcpc](https://github.com/apify/mcpc)

## mcpsnoop

Sits between an app and a server and shows every message passing through,
live in the terminal. That's what curl and the Inspector can't show: what
a real app such as Claude Code actually sends, and in what order. Useful
when an app and the Inspector disagree.
[github.com/kerlenton/mcpsnoop](https://github.com/kerlenton/mcpsnoop)

## mcp-remote

The reverse of what we built. Some apps can only start servers over
stdio, such as older Claude Desktop setups. mcp-remote is a small stdio
server that forwards everything to a server at a URL, OAuth sign-in
included. With it, a stdio-only app can use the live Worker:

```json
{
  "mcpServers": {
    "dice": { "command": "npx", "args": ["mcp-remote", "https://mcp.backspaces.workers.dev/dice"] }
  }
}
```

Our own servers don't need it: each file speaks stdio and HTTP itself.
[github.com/geelen/mcp-remote](https://github.com/geelen/mcp-remote)
