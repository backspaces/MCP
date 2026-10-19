// All three kinds in one server, over the same small set of recipes:
//   a tool      the model calls:   search_recipes
//   resources   you attach:        recipe://index, recipe://{name}
//   a prompt    you pick:          plan_meal
import { mcpServer, z } from "../mcp.ts";

const recipes = {
  pancakes: {
    serves: 4,
    ingredients: ["2 cups flour", "2 eggs", "1.5 cups milk", "2 tbsp sugar", "2 tsp baking powder"],
    steps: ["Whisk dry", "Whisk wet", "Combine, lumps are fine", "Cook on a hot griddle"],
  },
  guacamole: {
    serves: 4,
    ingredients: ["3 avocados", "1 lime", "1/2 onion", "1 jalapeño", "cilantro", "salt"],
    steps: ["Mash avocados", "Chop the rest finely", "Mix, salt and lime to taste"],
  },
  omelette: {
    serves: 1,
    ingredients: ["3 eggs", "butter", "salt", "cheese or herbs"],
    steps: ["Beat eggs with salt", "Melt butter, add eggs", "Stir, fill, fold"],
  },
};

const show = (name) => {
  const r = recipes[name];
  if (!r) throw new Error(`No recipe called "${name}".`);
  return `${name} (serves ${r.serves})\n\nIngredients:\n` +
    r.ingredients.map((i) => `- ${i}`).join("\n") +
    `\n\nSteps:\n` + r.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
};

export default mcpServer({
  name: "recipes",

  tools: {
    search_recipes: {
      description: "Find recipes whose name or ingredients mention a word. Returns full recipes.",
      readOnly: true,
      args: { word: z.string().min(1).describe('e.g. "eggs" or "lime"') },
      run: ({ word }) => {
        const w = word.toLowerCase();
        const hits = Object.keys(recipes).filter((name) =>
          (name + " " + recipes[name].ingredients.join(" ")).toLowerCase().includes(w)
        );
        return hits.length ? hits.map(show).join("\n\n---\n\n") : `No recipes mention "${word}".`;
      },
    },
  },

  resources: {
    index: {
      uri: "recipe://index",
      description: "The names of all recipes",
      read: () => Object.keys(recipes).join("\n"),
    },
    recipe: {
      uri: "recipe://{name}",
      description: "One recipe: ingredients and steps",
      list: () => Object.keys(recipes).map((name) => ({ uri: `recipe://${name}`, name })),
      read: ({ name }) => show(name),
    },
  },

  prompts: {
    plan_meal: {
      description: "Plan a meal for some number of guests from the recipes here.",
      args: {
        guests: z.string().describe("How many people"),
        notes: z.string().optional().describe('Anything to keep in mind, e.g. "no eggs"'),
      },
      run: ({ guests, notes }) =>
        `Plan a meal for ${guests} people using only recipes from the recipes server ` +
        `(search_recipes can find them). Scale the ingredients to fit, ` +
        `then give me one combined shopping list.` +
        (notes ? `\n\nKeep in mind: ${notes}` : ""),
    },
  },
});
