# The Claude App and Our MCP Servers

Oct 20, 2026 · Owen Densmore

> A copy of the [online Claude Doc](https://claude.ai/code/artifact/8de3869d-4d3c-48b1-bd1a-bbe673154d48), exported Oct 21, 2026. The two don't stay in sync.

The Claude app is an MCP client: our servers give it new abilities, and the only question is how it reaches them. Running on your computer, it can start a server itself. Running in the cloud, it needs a public HTTPS URL.

## What "the Claude app" means

"The Claude app" is one account seen through three windows. Conversations, projects and connectors follow you between them.

- **claude.ai** in a web browser. It runs on Anthropic's servers, not your computer.
- **Claude Desktop** for Mac and Windows. Same chats as the web, plus it can start programs on your computer.
- **Claude mobile** for iPhone and Android. Same account; it uses the connectors you set up on the web.

**Claude Code** is a different product: a coding assistant in the terminal and in VS Code. It is also an MCP client, and it is where we built and tested our servers. This tutorial is about the other three.

In every case Claude (the model) never talks to our server directly. The app does: it lists our tools to Claude, and when Claude wants one, the app makes the call and hands back the answer.

## Connectors: how the app uses MCP

In the Claude app, an MCP server is called a **connector**. There are three kinds, and only the last needs your own computer.

- **Directory connectors.** Ready-made ones from other companies (Google Drive, Gmail, Slack and so on). You click Connect and sign in.
- **Custom connectors.** Any MCP server with a public URL, ours included. You paste the URL. Anthropic's servers make the calls, [from Anthropic's cloud rather than your device](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp), so `localhost` can never work.
- **Local servers in Claude Desktop.** Desktop can start a program on your Mac, the same stdio way Claude Code starts ours. These work only in Desktop, not on the web or phone.

Connectors live in your account, so one added on claude.ai also shows up in Desktop and on mobile. Local Desktop servers do not travel.

## Add one of our servers to claude.ai

You need a public HTTPS URL that reaches a running copy of the server. A GitHub repo or GitHub Pages URL will not do: those hand back the file, not the result of running it.

**Step 1: get a public URL.** Pick one.

- **Today, from your Mac (a tunnel).** No account or hosting. It works only while your Mac and both terminals stay running, and the URL changes each time.

  ```sh
  deno serve -A serve-all.ts                                       # terminal 1: every server, at /dice, /hello, /recipes
  cloudflared tunnel --protocol http2 --url http://localhost:8000   # terminal 2
  ```

  It prints a URL like `https://some-random-words.trycloudflare.com`. Each server is that URL plus its name, such as `…/recipes`; the bare URL only lists them. Use `--protocol http2`: the default (QUIC) kept dropping on our home network. Installing cloudflared on macOS 14 needed Cloudflare's ready-built download rather than Homebrew; [remote.md](remote.md) has those steps and how the tunnel works.
- **Later, always on (a host).** Val Town or Cloudflare Workers runs the same file for you and gives a fixed address, such as `https://backspaces-recipes.web.val.run` or `https://recipes.backspaces.workers.dev`. Which host is still to be decided.

Check the URL plus /recipes in a browser first: you should see the "recipes: an MCP server" page.

**Step 2: add the connector.**

1. On claude.ai go to **Customize > Connectors**, click **+ Add**, then **Add custom connector**.
2. Name it `recipes` and paste the URL ending in /recipes. Click **Continue**.
3. For authentication choose **No sign in** (our servers have no login). Click **Add**.

To change the URL later, remove the connector and add it again. That matters for the tunnel, whose URL changes every run.

**Plan limits.** Custom connectors work on every plan, but [Free allows only one](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp). On Team and Enterprise plans an Owner adds it under **Organization settings > Connectors**, then each person clicks **Connect**.

## Use it in a chat

Once added, a connector is used through tools: you ask in plain words and Claude decides when to call one.

1. Start a new chat. Click **+** at the lower left of the message box (or type `/`), hover **Connectors**, and make sure `recipes` is switched on for this chat.
2. Ask something the tool answers: "What can I make with lime?"
3. Claude asks permission the first time it calls `search_recipes`. Approve it. Choose **Allow always** only for servers you trust.
4. The answer is built from what the server returned. Expand the tool call in the chat to see the raw result.

**Resources and prompts are not guaranteed here.** Anthropic's connector pages describe tools only. Our `recipe://` resources and the `plan_meal` prompt may or may not show up in the **+** menu, so treat tools as what works everywhere, as our README already says.

This is the same flow as in Claude Code: there the tool shows up after `claude mcp add`; here, after you add the connector.

## Claude Desktop with our local servers

Claude Desktop can run our servers straight from the repo, with no URL and nothing to host. It works the way `.mcp.json` does for Claude Code, but in Desktop's own config file.

1. In the Mac menu bar choose **Claude > Settings…**, open the **Developer** tab and click **Edit Config**. That opens `~/Library/Application Support/Claude/claude_desktop_config.json`.
2. Add our servers:

   ```json
   {
     "mcpServers": {
       "recipes": {
         "command": "/Users/owen/.deno/bin/deno",
         "args": ["run", "-A", "/Users/owen/Library/CloudStorage/Dropbox/Repos/MCP/servers/recipes.ts", "--stdio"]
       }
     }
   }
   ```
3. Quit Desktop completely (Cmd+Q) and reopen it. Check **+ > Connectors** in a chat.

Two differences from Claude Code matter:

- **Full paths everywhere.** Desktop is not started from the repo, so `./servers/recipes.ts` would fail. The [MCP docs](https://modelcontextprotocol.io/docs/develop/connect-local-servers) require absolute paths.
- **Full path to deno.** Apps opened from the Dock may not see your shell's PATH, so give `/Users/owen/.deno/bin/deno` rather than `deno`. Each person's path differs; `which deno` shows yours.

If a server will not start, its error log is in `~/Library/Logs/Claude/mcp-server-recipes.log`.

## Claude Code's `claude mcp` commands

`claude mcp` is a command-line tool, not an API: every command reads or writes the server list in Claude Code's config files. Editing those files by hand does the same thing. Everyday use needs only `add`, `list`, `get` and `remove`, plus `--scope` and `--transport`.

**Managing the list**

| Command | What it does |
| --- | --- |
| `add <name> …` | Add a server |
| `add-json <name> '<json>'` | Add one from the same JSON that `.mcp.json` holds |
| `add-from-claude-desktop` | Copy Claude Desktop's servers into Claude Code |
| `list` / `get <name>` | Show all servers or one, and check that they respond |
| `remove <name>` | Delete one |
| `reset-project-choices` | Forget your approve or reject answers for this repo's `.mcp.json`, so it asks again |

**Options on `add`**

- `-s, --scope local|user|project`: where the entry is saved. `local` (the default) is `~/.claude.json` for this folder only; `user` is `~/.claude.json` for every folder; `project` is `.mcp.json` in the repo.
- `-t, --transport stdio|http|sse`: how Claude Code reaches the server, by starting it (stdio, the default) or at a URL. SSE is the older URL style, replaced by HTTP.
- `-e KEY=value`: an environment variable for a stdio server, the usual way to pass an API key without putting it in the code.
- `-H "Header: value"`: a fixed header sent with every request to an HTTP server, typically `Authorization: Bearer …`.
- `--client-id`, `--client-secret`, `--callback-port`: for HTTP servers that use an OAuth login.

**Logging in**

- `login <name>` / `logout <name>`: sign in to or out of a server that requires an account. That is how the claude.ai connectors (Gmail, Drive and so on) get their access.

**Two surprises**

- `add-from-claude-desktop` means servers set up in Claude Desktop (the section above) come into Claude Code with one command.
- `serve` turns Claude Code itself into an MCP server, so another MCP client can use Claude Code's own tools, such as reading and editing files. It is the reverse of everything else here.

The full list is in `claude mcp --help`, and `claude mcp add --help` shows each option.

## Quick reference

| Client | Where it runs | How it reaches our server | Where it is set up |
| --- | --- | --- | --- |
| claude.ai (web) | Anthropic's cloud | public HTTPS URL | Customize > Connectors |
| Claude mobile | Anthropic's cloud | public HTTPS URL | inherits claude.ai connectors |
| Claude Desktop | your Mac | public URL, or starts it locally (stdio) | Connectors, or `claude_desktop_config.json` |
| Claude Code | your Mac | starts it locally (stdio) | `.mcp.json` in the repo |
| Codex, Cursor and others | your Mac | starts it locally (stdio), or a URL | each app's own config file |

**Troubleshooting**

- *claude.ai cannot connect.* Open the URL in a browser. No info page means the server or tunnel is down, or the URL is `localhost`.
- *Desktop shows no server.* Check full paths, quit with Cmd+Q, then read `~/Library/Logs/Claude/mcp-server-<name>.log`.
- *The tool is never used.* Check the connector is switched on in this chat under **+ > Connectors**, and ask in words close to the tool's description.

**Safety.** A public URL with **No sign in** can be called by anyone who finds it. That is fine for recipes and dice. Anything private needs a login (OAuth) before it goes online.
