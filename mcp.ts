// Make an MCP server from plain objects. A server can offer three kinds
// of things, each controlled by someone different:
//
//   tools      the model decides to call them   (do something, look something up)
//   resources  the app or user attaches them    (read-only data, by URI)
//   prompts    the user picks them              (canned instructions, with blanks)
//
// mcpServer returns { fetch }, a standard web handler, so a server file's
// `export default mcpServer(...)` runs over HTTP with `deno serve`, or on
// any host that takes a fetch handler. Run the same file with `--stdio`
// and it instead talks over stdin/stdout, for apps that start it themselves.
//
// This file uses only web standards, so it runs on any host. What's
// particular to one host lives in hosts/<that host>/.
//
// The package names below are resolved from package.json: by Deno through
// its own cache (deno.json says so), and by Node and Cloudflare's build
// from node_modules after `npm install`.
import {
  createMcpHandler,
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/server";
import * as z from "zod/v4";

export { z };

// readOnly and destructive become the MCP hints clients use to decide
// which tools need asking first. Left out, they're not sent.
const hints = ({ readOnly, destructive }) => ({
  ...(readOnly !== undefined && { readOnlyHint: readOnly }),
  ...(destructive !== undefined && { destructiveHint: destructive }),
});

const text = (s) => ({ content: [{ type: "text", text: s }] });

// A tool's run returns a string. Anything it throws becomes a tool result
// the model can read (isError), rather than a protocol error.
const safely = (run) => async (args) => {
  try {
    return text(String(await run(args)));
  } catch (e) {
    return { ...text(e.message ?? String(e)), isError: true };
  }
};

// {
//   name: "hello",
//   tools:     { tool_name: { description, args?, readOnly?, destructive?, run } },
//   resources: { res_name:  { uri, description, mimeType?, list?, read } },
//   prompts:   { prompt_name: { description, args?, run } },
// }
// args are { argName: z.string()... }. Every run and read returns a string
// (or a promise of one).
//
// A resource whose uri has {blanks} (e.g. "recipe://{name}") is a template:
// read gets the blanks' values, and list() returns the concrete ones
// ([{ uri, name }]) so apps can show them. A plain uri is one resource,
// and read gets nothing.
//
// A prompt's run returns the text of the message the user sends. Prompt
// arguments are always strings (that's MCP's rule), so use z.string().
export function mcpServer({ name, tools = {}, resources = {}, prompts = {} }) {
  const makeServer = () => {
    const server = new McpServer({ name, version: "1.0.0" });

    for (const [toolName, tool] of Object.entries(tools)) {
      server.registerTool(toolName, {
        annotations: hints(tool),
        description: tool.description,
        inputSchema: z.object(tool.args ?? {}),
      }, safely(tool.run));
    }

    for (const [resName, res] of Object.entries(resources)) {
      const meta = { description: res.description, mimeType: res.mimeType ?? "text/plain" };
      const contents = (uri, s) => ({ contents: [{ uri: uri.href, mimeType: meta.mimeType, text: s }] });
      if (res.uri.includes("{")) {
        const template = new ResourceTemplate(res.uri, {
          list: res.list && (async () => ({ resources: await res.list() })),
        });
        server.registerResource(resName, template, meta, async (uri, vars) =>
          contents(uri, await res.read(vars)));
      } else {
        server.registerResource(resName, res.uri, meta, async (uri) =>
          contents(uri, await res.read()));
      }
    }

    for (const [promptName, prompt] of Object.entries(prompts)) {
      server.registerPrompt(promptName, {
        description: prompt.description,
        ...(prompt.args && { argsSchema: z.object(prompt.args) }),
      }, async (args) => ({
        messages: [{ role: "user", content: { type: "text", text: await prompt.run(args ?? {}) } }],
      }));
    }

    return server;
  };

  // Deno and Node spell a program's arguments differently; other hosts
  // have none. The stdio code loads only when it's used.
  const args = globalThis.Deno?.args ?? globalThis.process?.argv?.slice(2) ?? [];
  if (args.includes("--stdio")) {
    import("@modelcontextprotocol/server/stdio").then(({ serveStdio }) => serveStdio(makeServer));
  }

  const handler = createMcpHandler(makeServer);

  // A browser visit (a GET that doesn't ask for an event stream) gets a
  // page for people listing what's here, instead of "Method not allowed".
  const fetch = (req) =>
    req.method === "GET" && !req.headers.get("accept")?.includes("text/event-stream")
      ? note(handler, name, publicUrl(req))
      : handler.fetch(req);

  return { fetch };
}

// Several servers at one address, each under its own path:
// mount({ dice, recipes }) serves /dice and /recipes, and / lists them.
// Every host serves servers.ts this way.
export function mount(servers) {
  return {
    fetch(req) {
      const server = servers[new URL(req.url).pathname.split("/")[1]];
      if (server) return server.fetch(req);
      const base = publicUrl(req).replace(/\/$/, "");
      const list = Object.keys(servers).sort().map((n) => `  ${base}/${n}`).join("\n");
      return new Response(`MCP servers here, one per address:\n\n${list}\n`);
    },
  };
}

// The address a caller used, for showing on pages. Behind a tunnel or
// proxy, requests arrive here as plain http; x-forwarded-proto says
// whether the caller actually used https.
export function publicUrl(req) {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto");
  if (proto) url.protocol = proto;
  return url.origin + url.pathname;
}

// Ask our own handler one MCP list method, as a client would, so the page
// can't drift from what's registered.
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

async function note(handler, name, url) {
  const [{ tools = [] }, { resources = [] }, { resourceTemplates = [] }, { prompts = [] }] =
    await Promise.all(["tools/list", "resources/list", "resources/templates/list", "prompts/list"]
      .map((m) => ask(handler, m)));
  const section = (title, how, items) =>
    items.length ? `${title}\n${how}\n\n${items.map((s) => "  " + s).join("\n")}\n\n` : "";
  const args = (list) => list.length ? ` (${list.join(", ")})` : "";
  return new Response(`${name}: an MCP server

This address is for AI apps, not browsers. It offers:

` +
    section("Tools",
      "Just chat in your own words. Claude uses these by itself when they help;\nyou never need to name them.",
      tools.map((t) => `${t.description} (${t.name})`)) +
    section("Resources",
      `Reference material Claude can read. In the Claude Code terminal, type @${name}:\nand pick one to add it to your message. In VS Code, just ask Claude, e.g.\n"read ${resources[0]?.uri ?? resourceTemplates[0]?.uriTemplate}".`,
      [
      ...resources.map((r) => `${r.uri}: ${r.description ?? r.name}`),
      ...resourceTemplates.map((r) => `${r.uriTemplate}: ${r.description ?? r.name}`),
    ]) +
    section("Prompts",
      `Ready-made requests. Pick one from the / menu, where it shows as\n/${name}:<prompt> (MCP).`,
      prompts.map((p) =>
      `${p.name}${args((p.arguments ?? []).map((a) => a.name))}: ${p.description}`)) +
    `Add it to Claude Code:
  claude mcp add --transport http ${name} ${url}
`);
}
