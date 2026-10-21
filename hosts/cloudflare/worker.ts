// Every server on Cloudflare Workers, at https://mcp.<your-subdomain>.workers.dev
//
//   deno task cf:dev       try it at http://localhost:8787
//   deno task cf:deploy    publish it
//
// README.md here has the whole story.
import { mount } from "../../mcp.ts";
import servers from "../../servers.ts";

export default mount(servers);
