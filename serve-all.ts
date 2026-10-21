// Every server in servers/ on one port, each under its own path:
// /hello, /dice, /recipes. This is what a web host runs, so apps like
// claude.ai and ChatGPT can reach them all at one address:
//
//   deno serve -A serve-all.ts
//
// A new file in servers/ shows up here by itself. Claude Code doesn't use
// this; it starts each server over stdio (see .mcp.json).
import { publicUrl } from "./mcp.ts";

const dir = new URL("./servers/", import.meta.url);
const servers = {};
for await (const { name } of Deno.readDir(dir)) {
  if (name.endsWith(".ts")) {
    servers[name.slice(0, -3)] = (await import(new URL(name, dir).href)).default;
  }
}

export default {
  fetch(req) {
    const server = servers[new URL(req.url).pathname.split("/")[1]];
    if (server) return server.fetch(req);
    const base = publicUrl(req).replace(/\/$/, "");
    const list = Object.keys(servers).sort().map((n) => `  ${base}/${n}`).join("\n");
    return new Response(`MCP servers here, one per address:\n\n${list}\n`);
  },
};
