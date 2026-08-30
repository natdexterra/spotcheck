# Spotcheck

**Your agent reads the RFQ. You spot-check it.**

Spotcheck is a review workspace for manufacturing quotes. An AI agent reads an RFQ package (customer email, purchase spec, part drawing) through [WebMCP](https://webmachinelearning.github.io/webmcp/) tools that the page exposes. It proposes a value for each field, attaches where in the documents it found that value, and flags places where the sources disagree or say nothing. The estimator checks the flagged fields against the highlighted sources, fixes what is wrong, and confirms the spec.

The agent can propose. Only a person can mark a field verified, change it, or confirm the quote request. That split is the whole point of the design.

Built for the [OpenAI WebMCP Challenge](https://webmcp.devpost.com/), August 25 to September 3, 2026.

## Status

Work in progress. The live URL, testing instructions and demo video land before submission.

## Testing

- **ChatGPT desktop app.** Open the live URL in the built-in browser (model GPT-5.6 Sol or Terra) and ask: "extract this RFQ into a quote request".
- **Chrome 149 or later.** Enable `chrome://flags/#enable-webmcp-testing`, relaunch, open the live URL and drive it with a WebMCP-capable agent such as the Model Context Tool Inspector extension.
- **Any other browser.** The app replays a recorded sample session into the same UI, so you still see the full product.

## How WebMCP is used

One module, `src/webmcp-tools.ts`, registers every tool with `document.modelContext.registerTool(...)`. The contract is asymmetric on purpose. The agent gets tools to read the package, propose values, report conflicts and missing data, and draft a clarification email once gaps exist. Verifying, editing, resolving and confirming have no tool at all; they exist only as UI actions.

## License

MIT. See [LICENSE](LICENSE).
