// The servers every host serves, each at /<name>. A new file in servers/
// gets one line here. (Hosts like Cloudflare have no files to look
// through, so the list is written out.)
import dice from "./servers/dice.ts";
import hello from "./servers/hello.ts";
import recipes from "./servers/recipes.ts";

export default { dice, hello, recipes };
