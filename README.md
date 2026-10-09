# NioGuru

NioGuru is a self-hosted chat workspace powered by the [Nio CLI](https://github.com/nio-labs/nio). Chat directly, choose one of twenty expert Gurus, or create your own specialist with instructions and selected skills.

![NioGuru chat with a custom Logo Guru and an SVG preview](screenshots/guruchat.png)

## Quick start

Requires Node.js 20 or later.

```bash
npx @nio-labs/nio-guru@latest
```

The launcher checks for Nio CLI, attempts to install it if needed, and opens the workspace at `http://localhost:3000`. If automatic installation fails, install Nio using [its setup instructions](https://github.com/nio-labs/nio), then restart NioGuru. Configure a working model provider in Nio before chatting.

```bash
# Install globally
npm install -g @nio-labs/nio-guru
nio-guru

# Choose a port or run without opening a browser
nio-guru --port 3001 --no-browser
```

### ☁️ 1-Click Deploy to Railway

Deploy your personal NioGuru workspace in one click:

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/new?template=https%3A%2F%2Fgithub.com%2Fnio-labs%2Fnio-guru)

- **Persistent Storage:** Mount a volume at `/data` (`RAILWAY_VOLUME_MOUNT_PATH=/data`) so NioDB, custom Gurus, and chat history persist across redeploys.
- **Nio AI Chat:** Bundled with Nio CLI (`@nio-labs/nio-ai`) out of the box.
- **Password Protection (Optional):** Define `APP_PASSWORD` environment variable to secure your private deployment.
- **Free Automatic SSL:** Access directly via `https://<your-project>.up.railway.app`.

## What's new in 0.6.0

- **Multi-Guru `@guru` Mentioning & Collaboration:** Summon any Guru dynamically into the active discussion by typing `@` in the composer with smart autocomplete. Prompts are intelligently routed with the mentioned Guru's instructions, skills, and knowledge base.
- **Dynamic Guru Identification Badges:** Messages now carry distinct Guru avatar icons and category badges so collaborative, multi-turn discussions clearly show which specialist provided each answer.
- **Conversation Forking & Branching:** Split off and explore alternative conversation paths from any point in the thread with the one-click **Branch** action button (`POST /api/conversations/:id/fork`).
- **Inline Prompt Editing:** Edit earlier user prompts directly in the feed. Clicking **Save & Branch** creates a clean timeline fork and generates a fresh answer without destroying previous chat history.

### Added in 0.5.0

- **Global Full-Text Search Modal (Cmd+K / Ctrl+K):** Instantly search messages, snippets, and conversation history across all Gurus and topics with keyboard navigation and jump-to-message view.
- **Guru Knowledge Base (RAG context injection):** Attach reference documents (markdown, text, code, specifications) directly to any Guru. Documents are persisted in NioDB and automatically injected into context to enrich chat answers.
- **Enhanced PWA Window Controls Layout:** Cleaned up titlebar clearance calculations in desktop PWA Window Controls Overlay mode so collapse/expand transitions and system control buttons render seamlessly without overlapping action items.

### Added in 0.4.1

- **Native NioDB Persistence:** Complete migration from SQLite to embedded `@nio-labs/nio-db.js` and supervised `niodb` daemon with automated bearer authentication and connection health checks.
- **Resilient Mermaid Diagrams:** Added proactive Mermaid auto-repair pipeline (`autoRepairMermaid`) that repairs unclosed sequence blocks (`loop`, `alt`, `opt`, `par`, `critical`), multi-participant notes, unquoted flowchart brackets, and DOMPurify rendering issues.
- **Default Light Theme:** Configured clean Light Mode as default theme on fresh loads and installations without unintended dark mode flashes.
- **PWA Titlebar Overlay Optimization:** Refined window controls overlay titlebar dodge logic so regular desktop windows and uncollapsed toolbars don't add unwanted empty spacing.
- **Automated npm Publishing in CI/CD:** Integrated automated npm package publishing to GitHub Actions on tag releases using `NPM_TOKEN`.

### Added in 0.3.3

- **Installable PWA:** Install NioGuru from a supported browser for a standalone app window, with app icons and automatic updates. Chat still requires a connection to the server.
- **Retry responses:** Retry a message directly from the conversation.
- **Rendering improvements:** Better Markdown table formatting, SVG previews, and sidebar conversation previews.
- **Updated interface:** Hugeicons throughout the workspace and a refreshed app logo.
- **Free model defaults:** New chats prefer Mini Code, then StepFun, then Kilo Auto. Image attachments continue to select StepFun.
- **Larger text attachments:** Send up to 512 KB of text and code attachments, including the accompanying message.

### Added in 0.3.2

- **10 New Gurus (Technical, Creative & Everyday Living):** Expanded built-in roster from 11 to 21 specialists!
  - 🎨 **Logo Design:** Brand marks, monograms, optical geometry, and SVG construction with bundled `logo-design-skill`.
  - 📊 **Data & ML:** Exploratory data analysis, PyTorch/Scikit-learn modeling, and data storytelling.
  - 🧪 **QA & Testing:** Bulletproof test architecture, Playwright, Vitest, and fuzzing edge cases.
  - 🤖 **Agent Architect:** LLM orchestration, structured tool schemas, MCP servers, and multi-agent loops.
  - 📑 **Technical Writer:** ADRs, RFCs, OpenAPI specs, and developer documentation.
  - 🍳 **Chef & Culinary:** Everyday kitchen mentor for quick recipes, fridge triage, techniques, and food pairings.
  - ✈️ **Travel & Itinerary:** Day-by-day itineraries, hidden neighborhood gems, packing lists, and local cultural tips.
  - 💪 **Fitness & Wellness:** Home and gym workouts, desk mobility, recovery, and macro guidance.
  - 📖 **Storyteller:** Fiction writing, novel plotting, character arcs, worldbuilding lore, and dialogue punch-ups.
  - 🎯 **Clarity & Life:** Daily prioritization, overcoming paralysis, Sunday reset routines, and life strategy.
- **Bundled Logo Design Skill:** Bundled [`kaankiziltug/logo-design-skill`](https://github.com/kaankiziltug/logo-design-skill) directly into the server for offline-ready vector and identity workflows.

### Added in 0.3.1

- **1-Click Railway Deployment:** Instant zero-config cloud deployment with persistent storage volume for NioDB, custom Gurus, and chat history.
- **Automated CI/CD Workflows:** Automated GitHub Actions release pipeline for tags with GitHub Releases and npm publishing.

### Added in 0.3.0

- **File attachments:** Attach text and images with the paperclip, drop files into the chat, or paste from the clipboard. Attachments appear in the conversation and can be removed before sending.
- **Image reading:** Adding an image selects StepFun automatically, including if the model was changed before sending.

### Added in 0.2.0

- **Custom Gurus:** Add a name, description, instructions, and an icon from the Hugeicons picker. Fill with AI drafts the fields and selects relevant available skills. Review and edit the draft before creating the Guru.
- **Skills in the UI:** Search installed and bundled skills, view collapsed descriptions, and select multiple skills per Guru. Install additional skills from a GitHub repository with an optional folder path.
- **Offline defaults:** Pinned upstream skills and supporting files are bundled with the server. Built-in defaults need neither Git nor GitHub access. Additional GitHub installations require server network access and Git.
- **Chat history:** Loading skeletons and pages of 30 messages reduce initial loading. Scroll upward to load older messages while preserving your reading position.
- **Streaming:** Stop confirmation when switching chats, stable Markdown blocks, and a Latest button when you scroll away from incoming output.
- **Rendering:** Mermaid diagrams, highlighted code, and KaTeX formulas. SVG cards support preview backgrounds, code view, copying, and downloading; safe class styling is preserved.
- **Skill recovery:** Missing-skill errors offer an install action. If the package is already available, add it to the Guru; otherwise supply its GitHub source.
- **Branding:** NioGuru naming, Google Sans Code typography, light/dark/system themes, and a matching teal-and-white app mark and favicon.

Custom Gurus can be deleted. Confirming deletion permanently removes that Guru and its conversations. Built-in Gurus cannot be deleted.

## Built-in Gurus

| Guru | Focus | Default skills |
| --- | --- | --- |
| Direct Chat | General conversation | None |
| Frontend | UI and frontend engineering | `frontend-design`, `svg-design` |
| Backend | APIs, databases, and backend engineering | `supabase-postgres-best-practices`, `error-handling-patterns` |
| Architect | Architecture and distributed systems | `architecture-patterns` |
| DevOps | Delivery and operations | `deployment-pipeline-design` |
| Security | Security analysis | `stride-analysis-patterns` |
| Debug | Debugging and diagnosis | `debugging-strategies`, `error-handling-patterns` |
| Logo Design | Brand identity, marks, SVG geometry & typography | `logo-design`, `svg-design`, `visual-design-foundations` |
| Data & ML | Data science, machine learning & analytics | `data-visualization`, `data-storytelling` |
| QA & Testing | Test architecture, Playwright, Vitest & fuzzing | `debugging-strategies`, `error-handling-patterns` |
| Agent Architect | LLM agents, tool schemas, MCP servers & RAG | `architecture-patterns`, `doc-coauthoring` |
| Technical Writer | ADRs, RFCs, API references & guides | `doc-coauthoring`, `data-storytelling` |
| Chef & Culinary | Kitchen companion, recipes, techniques & pairings | None |
| Travel & Itinerary | Trip curator, itineraries & local neighborhood tips | None |
| Fitness & Wellness | Workout programming, mobility & habit coaching | None |
| Storyteller | Fiction writing, worldbuilding, plotting & dialogue | `doc-coauthoring` |
| Clarity & Life | Prioritization, triage & intentional routines | None |
| Trading | Trading research | `backtesting-frameworks`, `risk-metrics-calculation` |
| Finance | Financial analysis | `risk-metrics-calculation`, `data-storytelling` |
| Product | Product planning and documentation | `doc-coauthoring` |
| Research | Research synthesis and documentation | `doc-coauthoring` |


## Skills

Open **Skills** in a Guru's chat to manage its selections. Selected skills appear first, and descriptions are collapsed by default. Save an empty selection to use no skills. Install packages from the Skills dialog or Add Guru form using a GitHub URL and optional skill folder.

Skills provide guidance; they do not add model capabilities. A comic skill can guide scripts and image prompts, but actual image generation requires an image backend. NioGuru runs chat turns in Nio's `ask` mode with project and shell tools disabled. It retains `read_skill_file` for selected packages and their references.

Each turn receives a private Nio catalog containing only the Guru's selected, enabled packages. Native user installations take precedence over bundled copies, including disabled state. Missing selections produce a warning, and the turn continues with available skills. The server supplies exact available names to avoid invented skill calls.

The temporary `NIO_CONFIG` includes a provider configuration copy, selected packages, and a link to persistent Nio sessions. Temporary files are removed after the process exits. The shared native registry and other Gurus' selections are preserved. An uninstall of a previously observed native override does not silently restore its bundled version.

You can also manage native packages with Nio CLI, using the server's account and configuration:

```bash
nio --skills add https://github.com/org/repo skills/my-skill
nio --skills enable my-skill
```

Pinned sources and revisions are recorded in [packages/bundled-skills/manifest.json](packages/bundled-skills/manifest.json); supporting files and license notices are embedded in the compiled server. Maintainers can regenerate snapshots with `python3 scripts/bundle-skills.py`, or use `--refresh` to update upstream revisions. This maintenance command needs network access.

## Models and sessions

Use the paperclip, drop files anywhere in the chat window, or paste copied files and images to attach UTF-8 text files or PNG, JPEG, GIF, and WebP images. Attaching an image switches the conversation to StepFun for image reading. Remove individual files before sending, or send attachments without a written prompt. Nio receives each uploaded file through `--file`. PDF is not supported by Nio yet; export its text or attach page images instead.

Messages accept up to 8 files, with a 10 MB limit per image and 20 MB combined limit. When files are attached, the message and text attachments together are limited to 512 KB. Original uploads are staged privately for the turn and removed after completion or cancellation. Attachment names and sizes remain in chat history; original files are not stored for later download.

New chats prefer an available free model in this order: **Mini Code**, **StepFun**, then **Kilo Auto**. Existing available conversation models and deliberate model selections are preserved. If catalog loading fails, Mini Code is the fallback.

Each conversation is bound to its own Nio session using `-s`. Streaming requests save messages and tool metadata in NioDB. Changing Gurus or starting another conversation during a response prompts you to stop the current response first.

## Development

```bash
git clone https://github.com/nio-labs/nio-guru.git
cd nio-guru
pnpm install
pnpm dev

# Build frontend and server
pnpm build
pnpm start
```

`pnpm dev` runs Vite for the web app and `tsx watch` for the API. Server source changes restart the API; web source changes update through Vite. Restart the command after editing `bin/nio-guru.js`.

| Directory | Purpose |
| --- | --- |
| `apps/web` | Vue 3 UI, Pinia state, Markdown and SVG rendering |
| `apps/server` | Hono API, NioDB SDK storage, Nio subprocesses |
| `packages/gurus` | Built-in Guru manifests |
| `packages/shared` | Shared model selection and icon names |
| `packages/bundled-skills` | Pinned upstream package manifest |
| `bin/nio-guru.js` | npm command launcher |
| `scripts/bundle-skills.py` | Upstream skill snapshot maintenance |

## Hosting and storage

NioGuru uses the separately running NioDB CLI server and its installed `@nio-labs/nio-db.js@1.0.5` client. `npm start` and the `nio-guru` launcher start a local NioDB CLI child process, wait for its authenticated health response, and stop that child when the app exits. Local data and private credentials live in `~/.nioguru/niodb`; set `NIODB_DIR` to choose another location. Docker and Railway persist `/data/niodb` and start both processes through the launcher. `PORT` defaults to `3000`; `HOST` defaults to `0.0.0.0`. `NIO_BIN` selects the Nio executable.

To use an externally managed NioDB server, set both server-only `NIODB_URL` and `NIODB_TOKEN` before starting NioGuru. The launcher then connects to that server and does not start or stop it. The app initializes its collection policies and built-in Gurus in a fresh NioDB workspace before serving requests. Existing SQLite files are not imported; back them up separately before switching an existing installation.

Run one NioGuru API instance for now. NioDB leases fence writes across processes, while stopping a native Nio CLI turn still uses the local process handle. The NioJS execution bridge in the [alignment plan](NIO_ALIGNMENT_PLAN.md) is the next step before multiple API replicas.

`APP_PASSWORD` optionally protects API requests using `X-App-Password` or a `password` query parameter. The health endpoint remains public. The web UI does not currently provide a password sign-in flow, so deployments using this setting must arrange credential forwarding.

## License

MIT © [nio-labs](https://github.com/nio-labs). Bundled upstream skills retain their included license notices.
