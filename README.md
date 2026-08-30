# Spotcheck

**Your agent reads the RFQ. You spot-check it.**

Spotcheck is a review workspace for manufacturing quotes. An AI agent reads an RFQ package (customer email, purchase spec, part drawing) through [WebMCP](https://webmachinelearning.github.io/webmcp/) tools the page exposes, proposes field values with provenance, and reports conflicts and gaps. The estimator verifies, resolves and confirms. The agent can propose; only the human can verify, edit or confirm.

Built for the [OpenAI WebMCP Challenge](https://webmcp.devpost.com/) (August 25 – September 3, 2026).

## Status

Work in progress. Live URL, testing instructions and the demo video will be added before submission.

## Testing (to be completed)

- **ChatGPT desktop app:** open the live URL in the built-in browser (model GPT-5.6 Sol or Terra) and ask: "extract this RFQ into a quote request".
- **Chrome 149+:** enable `chrome://flags/#enable-webmcp-testing`, relaunch, open the live URL, and use a WebMCP-capable agent (for example the Model Context Tool Inspector extension).
- **Any other browser:** the app loads a recorded sample session into the same UI.

## How WebMCP is used

All tools are registered in one module, `src/webmcp-tools.ts`, via `document.modelContext.registerTool(...)`. The tool contract is deliberately asymmetric: read tools and proposal tools exist for the agent; verify, edit, resolve and confirm exist only in the UI.

## License

MIT — see [LICENSE](LICENSE).
