// The smallest useful MCP server: one tool. Copy this to start a new one.
import { mcpServer, z } from "../mcp.ts";

export default mcpServer({
  name: "hello",
  tools: {
    greet: {
      description: "Say hello to someone by name.",
      readOnly: true,
      args: { name: z.string().min(1).describe('Who to greet, e.g. "Owen"') },
      run: ({ name }) => `Hello, ${name}! (from the hello MCP server)`,
    },
  },
});
