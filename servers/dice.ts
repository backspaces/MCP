// A couple of tools, with arguments that have limits and defaults.
// Models are bad at real randomness, which is why this is a tool.
import { mcpServer, z } from "../mcp.ts";

const randomInt = (n) => 1 + Math.floor(Math.random() * n);

export default mcpServer({
  name: "dice",
  tools: {
    roll_dice: {
      description: "Roll dice, e.g. two six-sided dice. Returns each roll and the total.",
      readOnly: true,
      args: {
        count: z.number().int().min(1).max(100).default(1).describe("How many dice"),
        sides: z.number().int().min(2).max(1000).default(6).describe("Sides on each die"),
      },
      run: ({ count, sides }) => {
        const rolls = Array.from({ length: count }, () => randomInt(sides));
        const total = rolls.reduce((a, b) => a + b, 0);
        return `${count}d${sides}: ${rolls.join(", ")} (total ${total})`;
      },
    },

    flip_coin: {
      description: "Flip a fair coin: heads or tails.",
      readOnly: true,
      run: () => (randomInt(2) === 1 ? "heads" : "tails"),
    },
  },
});
