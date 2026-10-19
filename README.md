# MCP

Small MCP servers to copy from. Each is one file in [servers/](servers/), and
[mcp.ts](mcp.ts) does the MCP part, so a server file is just what it offers.

MCP is not an AI. An MCP server adds abilities to an AI app you already use
(Claude, Codex, ChatGPT, …): the app is the client, and it calls the server.

## The three things a server can offer

| Kind | Who uses it | What it's for | In Claude Code |
| --- | --- | --- | --- |
| **Tools** | the model, when it decides to | do something or look something up | used automatically |
| **Resources** | you (or the app) attach them | read-only data, each at a URI | type `@` and pick one |
| **Prompts** | you pick them | canned instructions with blanks | `/mcp__recipes__plan_meal` |

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

## Running one

The same file runs two ways.

**Locally over stdio**: the AI app starts the server itself. Nothing is left
running, and there's nothing to host. Add it to Claude Code with:

    claude mcp add --scope user dice -- deno run -A /full/path/to/MCP/servers/dice.ts --stdio

**Over HTTP**: you run the server, and apps connect to its URL.

    deno serve -A --port 8787 servers/recipes.ts
    claude mcp add --transport http --scope user recipes http://localhost:8787/

Open http://localhost:8787/ in a browser to see what the server offers. The page
is built live from the server's own lists. `export default mcpServer(...)` is a
standard `fetch` handler, so the same file can go on any host that takes one
(Deno Deploy, Val Town, and others). Claude in a browser (claude.ai) needs a
public URL like that. It can't reach localhost.

## Making a new server

Copy `hello.ts` and fill in:

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
curl -s localhost:8787/ -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri":"recipe://pancakes"}}'
```
