// Every server on one port, with Deno, on any machine: your Mac (behind a
// Cloudflare tunnel, see docs/remote.md) or a server of your own.
//
//   deno serve -A hosts/deno/serve.ts
import { mount } from "../../mcp.ts";
import servers from "../../servers.ts";

export default mount(servers);
