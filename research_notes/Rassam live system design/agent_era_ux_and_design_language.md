# Agent-era UX and design language for Rassam

Research notes, 2026-11-22. Scope: interaction patterns for intent-first products, the visual language of current best-in-class product UI, usability of graph/canvas tools, live-status presentation, and CSS/implementation constraints for Tailwind v4 + React 19 + Next 16. Ends with an opinionated design brief.

Evidence labels used throughout:

- **[V]** verified this session against the primary source (URL in the Sources section).
- **[S]** secondary source only (search summary, third-party write-up). Treat as probable.
- **[M]** from memory / general knowledge, not re-checked this session. Verify before quoting publicly.
- **[R]** read from this repository.

Repo facts that constrain the brief **[R]**: `next 16.4.6`, `react 19.2.3`, `tailwindcss 4.1.18`, `reactflow ^11.11.4` (the legacy v11 package, not `@xyflow/react` v12), `dagre ^0.8.5`, `lucide-react`. No motion library is installed. `src/app/globals.css` already uses `@theme` plus a small `:root` surface ladder (`--surface-canvas #070b12` ... `--accent #22b8cf`). Component folders seen by name only (not read in depth): `navigation/ActivityBar`, `navigation/WorkspaceCommandPalette`, `navigation/WorkspaceStatus`, `canvas/EditToolbar`, `canvas/ExportPanel`, `canvas/FlowControls`, `canvas/GraphOutline`, `blueprint/{Attention,Components,Intent,Reach,Rules}Tab`, `blueprint/BlueprintInspector`, `blueprint/EdgePrompt`, `blueprint/SelectorPicker`, `sidebar/EnhancedChatbot`.

---

## 1. Interaction patterns for intent-first / agentic products

### 1.1 What the research says

**Nielsen: intent-based outcome specification.**
- The 2023 NN/g article frames three paradigms: batch (c. 1945), command-based (c. 1964), and intent-based outcome specification, where "the user tells the computer what outcome they want". It "completely reverses the locus of control". It also names the *articulation barrier* (roughly half of the population in rich countries is not articulate enough in prose to get good results) and predicts a *hybrid* UI that keeps GUI elements, because clicking and seeing remain important. **[V]**
- Nielsen's 2026-03-26 follow-up ("Intent by Discovery") is the most directly usable source for Rassam **[V]**:
  - A usable intent has three parts: desired **outcome**, **constraints**, and the **delegation boundary** (what the system may do on its own).
  - The user moves from operator to **supervisor**; autonomy is **earned by progressive delegation** (start by drafting and asking, widen scope as reliability is shown, high-stakes/externally visible actions last).
  - **Friction is applied deliberately**: none for low-stakes reversible work; pauses, granular authorization and provenance for high-stakes work.
  - Design around the articulation barrier: let people **select rather than describe** (suggestions, galleries, guided choices). "Discovery replaces description": divergent options, subtractive sculpting of a draft, Socratic questions when intent is vague.
  - Three interface layers: an **intent surface** (accepts input, proposes likely intents), an **orchestration surface** (plan, provenance, affected parties, governing policy, consent, and post-action *receipts* listing what changed and what can be undone), and a **direct-manipulation surface** as fallback for granular correction and emergency override.
  - New usability metrics: intent capture, clarification quality, evaluability, trust calibration; **time-to-correct matters more than time-on-task**.
  - "Delegation without surrender": explain enough that the user keeps judgment.

**Microsoft: Guidelines for Human-AI Interaction (Amershi et al., CHI 2019; HAX Toolkit).** 18 guidelines in four phases (initially, during interaction, when wrong, over time); validated with 49 practitioners against 20 products **[V for structure]**. Wording below is from memory of the paper **[M]**:
1. Make clear what the system can do. 2. Make clear how well it can do it. 3. Time services based on context. 4. Show contextually relevant information. 5. Match relevant social norms. 6. Mitigate social biases. 7. Support efficient invocation. 8. Support efficient dismissal. 9. Support efficient correction. 10. Scope services when in doubt. 11. Make clear why the system did what it did. 12. Remember recent interactions. 13. Learn from user behavior. 14. Update and adapt cautiously. 15. Encourage granular feedback. 16. Convey the consequences of user actions. 17. Provide global controls. 18. Notify users about changes.
The ones that matter most for a propose/apply loop: 7, 8, 9, 10, 11, 16, 17.

**Microsoft Research: Magentic-UI (arXiv 2507.22358, July 2025).** Six mechanisms **[V]**:
- **Co-planning**: agent and user agree a plan (steps with title, details, assignee) before execution; steps are editable directly or by text feedback; nothing runs until the user accepts.
- **Co-tasking**: user can interrupt, take over, answer the agent's questions.
- **Action guards**: each action type is tagged *always irreversible* (always ask), *maybe irreversible* (an LLM judge decides), *never irreversible* (never ask).
- **Answer verification**, **memory** (successful plans saved and suggested by autocomplete), **multitasking** (status indicator shows which sessions need input).
- Stated principle: interrupt "as little as possible and only when necessary".
- Evidence: a simulated user with side information lifted GAIA validation accuracy from about 30.3% to 51.9% while help was requested in only 10% of tasks, so sparse, well-timed human input is worth far more than constant approval. In the 12-person study (SUS 74.58) people valued plan editing, endorsed approvals for high-risk actions, found approvals for low-risk actions unnecessary, complained about latency and verbose plans, preferred visual over textual verification, and struggled to return to background tasks without a good state summary.

**DirectGPT (Masson, Malacria, Casiez, Vogel; CHI 2024).** A direct-manipulation layer over an LLM: continuous view of the object, manipulable outputs that *scope* the prompt, a toolbar that turns frequent prompts into commands, and undo. Participants were about 50% faster, used 50% fewer prompts, and prompts were 72% shorter than with plain ChatGPT; they preferred direct manipulation for specific, localized edits. **[V, abstract-level numbers]** Implication: *selection is part of the prompt*. Pointing at a node and typing "split this" beats describing the node.

**Kim et al. 2025 (arXiv 2507.22134)**: intent is not static or fully specified up front, so the UI must support intent communication as an ongoing process (refine, not restart). **[S]**

**Apple HIG, Generative AI page (new June 2025, updated June 8 2026).** **[V]**
- "Keep people in control": let people dismiss content, "revert or retry" transformations; identify where AI is used.
- Set expectations of what the feature can and cannot do; offer **curated suggestions** for open-ended prompts.
- "Get permission before performing irreversible or potentially problematic tasks"; avoid automating destructive actions.
- Surface **Edit, Undo, Retry, Adjust near the generated content**, and acknowledge when a correction took effect.
- **Specific progress text** beats "Processing..." (e.g. "Summarizing key themes from your notes"); on failure say what happened and give a next step.
- Consider offering **alternate versions**. Make the app work when AI is unavailable (non-AI fallback).

**Google PAIR People + AI Guidebook.** Chapters: user needs and defining success, data collection and evaluation, mental models, explainability and trust, feedback and control, errors and graceful failure. Core ideas: decide automation vs augmentation per task, calibrate trust (neither over- nor under-trust), explain with the level of detail the decision needs, show confidence only when it helps a decision, design the failure path first. **[M]** (the page returned no body text to the fetcher this session).

**Linear Agent Interaction Guidelines (July 2025).** Six principles **[V]**: an agent discloses that it is an agent; inhabits the platform natively; gives instant feedback; is transparent about internal state (thinking / waiting / executing / done, with reasoning inspectable); respects requests to disengage; cannot be held accountable (a human stays owner, the agent is a *delegate*). Linear's SDK models sessions with typed activities (thought, action, elicitation, response, error) and a plan whose steps are pending / inProgress / completed; an agent should acknowledge within 10 seconds. **[S]**

### 1.2 What shipping products do

| Product | Pattern worth copying | Label |
|---|---|---|
| **Railway** (canvas) | The canvas is the default project view and "source of truth". Edits are **staged in a changeset**; a banner on the canvas shows the count; staged items render **purple**; "Details" opens a diff of old and new values; each change has an "x" to discard; one Deploy applies all. Service cards state failure in words ("Build failed"). An architecture view acts as a minimap. | [V] staged changes, smart canvas; [S] architecture view |
| **Google Antigravity** | Manager view is an inbox of agent tasks with status at a glance. Agents produce **artifacts** (task list, implementation plan, walkthrough with screenshots/recordings) that humans review and comment on Google-Docs style instead of reading raw tool calls. A review policy decides whether the agent waits ("Always Proceed" is opt-in). | [S] from official docs via search |
| **Devin 2.0/2.1** | Interactive planning before work starts; a green/yellow/red **confidence rating**; when not green, it asks clarifying questions and waits, otherwise proceeds. Cognition reports green is about 2x as likely to end in a merged PR as red. | [S] |
| **Cursor** | Plan mode (plan without touching files), automatic checkpoints before agent operations with restore, per-change accept/reject. Notable 2026 lesson: moving the default from per-change review to a session-level bulk "Review" drew strong user complaints. Keep item-level control reachable. | [S] forum and third-party |
| **GitHub Agent HQ / mission control** | One place to assign, steer, track and approve many agents; plan mode; governance (policies, audit log). | [S] Oct 2025 coverage only |
| **Figma Make / v0** | Prompt first, then **point at an element and edit it** with a properties panel or a scoped prompt (Figma "point and edit"; v0 "design mode", Cmd+K scoped to the selection). | [S] help-center summaries |
| **tldraw agent starter kit** | Agent reads the canvas (screenshot + structured shapes), emits typed actions that are validated/sanitized, and streams changes onto the canvas; a side panel shows its work and lets the user reject. | [S]; accept/reject mechanics not confirmed |
| **Linear** | Cmd+K for everything; agents are delegates on issues; UI kept quiet so content dominates. | [V] design posts |
| **Raycast, Arc, Notion AI, Claude artifacts** | Command bar as primary surface with ranked suggestions and inline confirmation (Raycast); side-by-side artifact with versions and "edit this part" (Claude); inline accept / discard / try again on generated blocks (Notion). | [M] not re-verified |
| **GitHub Copilot Workspace** | Spec, then plan, then diff, each editable before the next. The technical preview was wound down in 2025 and folded into the coding agent. | [M] not re-verified |

### 1.3 The loop that all of them converge on

`intent` (typed, with selection as scope) → `acknowledge` (< 1 s, specific text) → `plan` (short, collapsible, editable) → `proposal previewed in place` (ghost objects on the artifact itself plus an itemized change list) → `apply` (one key) → `receipt` (what changed, what it touched) → `undo` (one key, always).

Two details separate the good implementations from the rest:
1. **The preview lives on the object, not in a chat transcript.** Railway's purple staged cards and Figma's point-and-edit both put the proposed state where the user is already looking.
2. **Review granularity is adjustable.** Bulk apply by default, per-item discard always available (Railway "x"; the Cursor regression shows what happens when it disappears).

### 1.4 Principle checklist (use as acceptance criteria)

1. **One intent surface.** A single, always-visible prompt bar; every capability is reachable from it. (HAX 7; Nielsen intent surface)
2. **Selection scopes intent.** Whatever is selected on the canvas is attached to the prompt as visible chips. (DirectGPT)
3. **Suggest, do not demand prose.** Show 3 to 5 context-ranked suggestions before the user types and after each result. (Nielsen articulation barrier; Apple "curated suggestions")
4. **Acknowledge instantly, narrate specifically.** First feedback within 400 ms; plain-language step text, never a bare spinner. (Apple; Linear AIG)
5. **Plans are short and collapsed.** Show a one-line summary with a step count; expand on demand; verbose plans were a named pain point. (Magentic-UI)
6. **Never mutate silently.** Every agent change is a proposal rendered as a diff on the canvas until applied. (Railway; HAX 16)
7. **Apply is one key, discard is one key, refine is typing.** Enter / Esc / keep typing. (HAX 8, 9)
8. **Item-level control stays reachable.** Each change in a proposal can be discarded individually. (Railway; Cursor lesson)
9. **Undo is universal and cheap.** Cmd/Ctrl+Z reverts the last applied proposal as one unit; history is a list of receipts. (Apple "revert or retry")
10. **Guard by reversibility, not by habit.** Three tiers: never ask, ask once, always ask. (Magentic-UI action guards; Apple)
11. **Explain with evidence, not adjectives.** Each proposed change links to the files/imports/rules that justify it. Show a confidence band only if it is calibrated; otherwise show evidence counts. (HAX 11; PAIR; Devin)
12. **Ask when unsure, with choices.** One clarifying question with 2 to 4 tappable answers beats a wrong guess or an essay. (HAX 10; Nielsen Socratic scaffolding)
13. **Progressive delegation.** Default is "propose and wait"; the user can raise autonomy per action class; loosening it is never the default. (Nielsen; Antigravity review policy)
14. **Direct manipulation remains.** Everything the agent can do is also doable by hand, one level down. (Nielsen hybrid UI; Apple non-AI fallback)
15. **Stop works immediately.** A visible Stop while the agent runs; partial work is discarded or kept as a draft proposal, never half-applied. (Linear AIG 5)
16. **The human owns the contract.** The UI states who approved each change. (Linear AIG 6: "an agent cannot be held accountable")
17. **Background work summarizes itself.** Returning to a finished or blocked task shows a two-line state summary first. (Magentic-UI multitasking finding)
18. **Disclose AI and its limits** at the point of use, once, without nagging. (Apple transparency; HAX 1, 2)

---

## 2. Visual design language of state-of-the-art product UI (2026)

### 2.1 Apple

**Materials and Liquid Glass (HIG Materials, updated Sept 9 2025). [V]**
- Liquid Glass is a **functional layer for controls and navigation floating above content**. "Don't use Liquid Glass in the content layer." "Use Liquid Glass effects sparingly ... Limit these effects to the most important functional elements."
- Two variants: **regular** (blurs and adjusts luminosity; use when there is text, e.g. alerts, sidebars, popovers) and **clear** (only over media-rich backgrounds; add a **35% dark dimming layer** if the content beneath is bright).
- Standard materials (ultra-thin, thin, regular, thick) remain for the content layer; thicker = more opaque = better contrast for fine text.
- Use vibrant (system) foreground colors on materials; avoid the lowest-contrast label level on thin materials.
- Glass changes under Reduce Transparency and Increase Contrast; custom elements need their own fallbacks. **[V/S]**
- WWDC25 session 219 guidance: avoid glass on glass; tint sparingly, for primary actions only. **[S]**

**The NN/g critique (Raluca Budiu, 2025-10-10, "Liquid Glass Is Cracked, and Usability Suffers in iOS 26"). [V]** Named failures: translucent controls over busy content lose contrast ("text on top of text"); floating bars obscure content; purposeless animation distracts (wiggling tabs, pulsating buttons); smaller, crowded targets; controls that appear and disappear make the layout unpredictable; essential actions pushed into overflow menus; pale search fields that vanish. Every one of these is a rule for what Rassam must *not* copy from the glass look.

**Typography. [V]** macOS built-in text styles (pt, size/leading): Large Title 26/32, Title 1 22/26, Title 2 17/22, Title 3 15/20, Headline 13/16 bold, Body 13/16, Callout 12/15, Subheadline 11/14, Footnote 10/13, Caption 10/13. macOS default 13 pt, minimum 10 pt. "In general, avoid light font weights": prefer Regular, Medium, Semibold, Bold. SF adjusts tracking and optical size continuously with point size.

**Accessibility. [V]** Contrast table used by Accessibility Inspector (WCAG AA): up to 17 pt 4.5:1; 18 pt and up 3:1; bold 3:1. macOS control size default 28x28 pt, minimum 20x20 pt. About 12 pt padding around bezeled controls. Convey information "with more than color alone" (distinct shapes or icons). Prefer explicit dismissal over auto-dismiss timers. Under Reduce Motion: tighten springs to remove bounce, replace x/y/z transitions with fades, avoid animating depth, **avoid animating into and out of blurs**.

**Motion. [M/S]** Apple motion is spring-based and interruptible. SwiftUI presets are described qualitatively: `smooth` (no bounce), `snappy` (small bounce), `bouncy`. The often-quoted default `response 0.55, dampingFraction 0.825` comes from third-party articles, not confirmed in Apple docs this session.

### 2.2 NVIDIA

- "Kaizen" is NVIDIA's internal design system name; a `kaizen-ui-foundations` stylesheet is served from `webassets.nvidia.com`, but no public documentation was found. **[S]** The public, open system is **NVIDIA Elements** (`nvidia.github.io/elements`, `--nve-*` tokens). **[V]**
- Elements `DESIGN.md` tokens **[V]** (light theme values shown in the file):
  - Brand accent `oklch(66% 0.18 130.79)`; neutrals at hue 248, chroma 0.006 (text 20% L, muted 53%, placeholder 65%, disabled 82%, field 90%, canvas 95%).
  - Font: `'Inter', Roboto, 'Open Sans', 'Helvetica Neue', sans-serif`; code `'Roboto Mono', ...`.
  - Type: display 40/1.12 w400, heading 24/1.25 w600, body 14/1.375 w400, label 14/1.375 w500, code 14/1.5.
  - Spacing: 8, 12, 16, 24, 32, 48. Radii: 4, 6 (controls), 8 (cards, panels), 14 (containers), 999.
  - A **rich status vocabulary with distinct hues**: running (blue 250), finished (green 147), failed (red 18), warning (yellow 95), restarting (76), starting (teal 178), stopping (magenta 343), queued (270), scheduled (292), pending/ignored (neutral gray).
  - Principles: "Never encode meaning through color, position, animation, or iconography alone. Pair status color with text and icons." "Avoid gradients, glass effects, oversized radii, and decorative shadows without a product need." Keep operational content "concise, scannable, and explicit about state".
- Brand: NVIDIA green `#76B900` on black. **[M]** for the hex as official; computed here: 8.71:1 on pure black, but white text on `#76B900` is only 2.41:1, so the green needs **dark text on it** or must be used as a line/glyph color, not as a fill behind white labels.
- Takeaway: NVIDIA's product UI is the opposite of glass. Flat, neutral-gray, small radii, one saturated brand color used rarely, and state spelled out in words.

### 2.3 Linear

- 2024 redesign **[V]**: theme generation moved from HSL to **LCH** because it is perceptually uniform; the theme went from **98 variables to 3: base color, accent color, contrast**; the contrast variable yields automatic high-contrast themes; Inter Display for headings, Inter for the rest; less blue in the neutrals; strict vertical/horizontal alignment of labels, icons and buttons; an "inverted L" of global chrome around the content.
- March 2026 refresh **[V]**: two principles worth quoting: "Don't compete for attention you haven't earned" (sidebar **dimmed** so content wins; compact tab bar; fewer and smaller icons; colored icon backgrounds removed) and "Structure should be felt, not seen" (fewer separators, softer contrast, rounded edges). Neutrals moved from cool blue-gray to a **warmer, less saturated gray**. Success criterion: most users do not notice.

### 2.4 Vercel Geist

- Ten scales (`backgrounds`, `gray`, `gray-alpha`, `blue`, `red`, `amber`, `green`, `teal`, `purple`, `pink`), each with **steps 100 to 1000 that have fixed jobs** **[V]**: 100 / 200 / 300 = component background default / hover / active; 400 / 500 / 600 = border default / hover / active; 700 / 800 = high-contrast background and its hover; 900 = secondary text and icons; 1000 = primary text and icons. Two page backgrounds only (Background 1 default, Background 2 sparingly). Solid gray by default; alpha gray only where the surface must show through; "draw each border once". P3 colors on capable displays.
- Geist Sans / Geist Mono typefaces; "materials" are presets of radius + fill + stroke + shadow. Raw hex values were not retrievable from the docs page. **[V for structure, values unverified]**

### 2.5 Stripe, Raycast **[M]**
Stripe: generous whitespace, restrained color, state shown with small labeled badges, heavy use of tabular numerals. Raycast: one dark elevated panel, 8 to 12 px radii, keyboard hints printed next to every action, a persistent action footer. Not re-verified this session.

### 2.6 Shared rules extracted

1. **Neutral-first.** 90%+ of pixels are a low-chroma gray ladder; one accent; status hues appear only where status exists.
2. **Perceptual color space.** Generate ladders in OKLCH/LCH so equal lightness steps look equal across hues (Linear, Elements).
3. **Steps have jobs.** Background, hover, active, border, strong border, secondary text, primary text (Geist).
4. **Structure felt, not seen.** Prefer spacing and a 2 to 4% lightness step over lines; when a line is needed, draw it once.
5. **Chrome recedes.** Navigation is dimmer than content.
6. **Translucency is a functional layer only**, over calm content, with an opaque fallback (Apple, and NN/g's critique).
7. **Weights 400 / 500 / 600 only.** No light weights (Apple).
8. **Motion explains a change of state** or it is removed (NN/g; Apple reduce-motion list).

### 2.7 Anti-patterns

- Glass over a busy canvas, glass on glass, or glass on content cards (nodes).
- Gray-on-gray text below 4.5:1; placeholder-as-label; disabled-looking secondary text.
- Animated blur, pulsing or shimmering elements with no state meaning, bounce on utility transitions, staggered entrance of whole lists.
- Many accent colors; colored icon tiles; gradients as decoration; glow shadows.
- Icon-only toolbars with no labels or key hints; essential actions in overflow menus.
- Controls that appear and disappear so the layout shifts.
- Status by color alone; red/green pairs with no glyph.
- Borders on every box (nested boxes with 1 px lines read as a spreadsheet).

---

## 3. Usability of graph / canvas tools

### 3.1 Readability research

- **Edge crossings** are the aesthetic with the largest measured effect on node-link readability (Purchase's studies of five aesthetics). **[S]** Later eye-tracking work (Huang et al.) found crossings near **90 degrees** are largely ignored, while small-angle crossings cause slow, back-and-forth eye movement; crossings matter mostly for **path-tracing** tasks. **[S]**
- Dunne and Shneiderman define readability metrics (node occlusion, edge crossing, crossing angle, edge tunneling) and recommend motif simplification / aggregation. **[S]**
- For directed graphs with a flow, **layered (Sugiyama) layouts** are the predictable choice; Grafana's node graph makes layered the default "especially useful for service graphs", notes it gets slow above 500 nodes, switches to force layout for 500+, and by default **shows at most 200 nodes** with the rest collapsed behind clickable markers. It also offers a **grid view** that drops edges and sorts nodes by a stat. **[V]**
- "Overview first, zoom and filter, then details on demand" (Shneiderman 1996) and path continuity as a readability factor (Ware et al. 2002). **[M]**
- GuidelineExplorer (arXiv 2406.05558) collects actionable node-link guidelines; the full list was not retrieved. **[S]**

Practical consequences for a system map:
1. **Layer by dependency direction** (callers above/left of callees) and keep the direction constant.
2. **Group into containers** (domain / layer) and route inter-group edges as bundles; collapsed groups show a rolled-up status (worst child wins; Carbon: "show the highest-attention color").
3. **Keep the visible set small**: aim for 7 to 30 nodes on first paint; collapse the rest. Hard cap near 200 rendered nodes.
4. **Orthogonal or smooth-step edges** with crossings near 90 degrees; never hairball straight lines.
5. **Edges are quiet by default** (1 px, low contrast), loud on hover/selection of an endpoint (highlight neighbors, dim the rest to about 35% opacity).
6. **Layout is stable.** Do not re-run layout on every change; animate only the nodes that move, and preserve user-moved positions. Railway users explicitly ask for a lock because nodes are "very easy to move by mistake" **[S]**: default to locked positions with an explicit "arrange" mode.

### 3.2 Semantic zoom / level of detail **[M, common practice; no formal guideline found]**

| Zoom | What a node shows |
|---|---|
| < 0.35 | Group containers only: name, count, one status glyph. Nodes become dots. |
| 0.35 to 0.75 | Node = name + status glyph. No secondary text, no handles, no ports. |
| 0.75 to 1.5 | Name, kind icon, one-line intent, status label, counts (rules, violations). |
| > 1.5 | Same as above; do not add more. Detail belongs in the inspector, not in ever-denser nodes. |

Text never renders below about 11 px effective size; below that, hide it rather than shrink it.

### 3.3 Progressive disclosure, empty states, time to first value

- Three levels only: **glance** (canvas + one health pill), **focus** (select a node → inspector sheet), **depth** (evidence, raw rule, JSON, history). Every extra panel must justify being more than one click from glance.
- NN/g response-time limits: 0.1 s feels instant, 1 s keeps flow, 10 s is the limit of attention. **[M]** So: stream the map in. Show the skeleton within 1 s, first real nodes within about 3 s, and name what is happening ("Reading imports in src/cli ...").
- **Empty state = the first action**, not an illustration: one input ("Paste a GitHub URL or drop a folder"), one sample project button. Target: a real, colored map of the user's own repo in under 60 seconds with zero configuration. If there is no blueprint yet, the agent drafts one and shows it as a proposal (the first proposal teaches the whole propose → apply loop).
- Apple: for open-ended inputs offer curated suggestions; Magentic-UI: suggest saved plans via autocomplete. **[V]**

### 3.4 Status at a glance

One **health pill**, top center, always visible, three possible states plus "unknown": `Contract holds` / `3 violations` / `Checking ...` / `Stale: 14 commits behind`. It is a button: click opens the list, each row focuses the node. No other persistent badges; no red dots in a sidebar. (Railway: state the failure in words on the card, "Build failed". **[V]**)

### 3.5 Keyboard and screen-reader access for diagrams

React Flow built-ins **[V]**: nodes and edges are focusable (`nodesFocusable`, `edgesFocusable`), Tab moves through them, Enter/Space selects, Escape clears, arrow keys move a selected node (Shift = faster), Delete removes; `autoPanOnNodeFocus` keeps the focused node in view; `ariaLabelConfig` customizes/localizes built-in text; node moves are announced through an `aria-live` region; per-node `ariaRole` and `domAttributes`. (Docs describe the current v12 API; this repo is on v11, where nodes get `tabIndex=0` + `role="button"` and `ariaLabelConfig` may not exist. **Check before relying on it.**)

What React Flow does not give you, and a diagram needs:
- A **parallel structured view**: an outline/tree or table of the same model ("Components" list with status and dependencies), reachable with one key, fully operable by screen reader. This is the accessible equivalent of the canvas and also the fallback for 200+ nodes (compare Grafana's grid view).
- **Spatial keyboard navigation**: arrow keys move focus to the nearest node in that direction; `]` / `[` follow outgoing / incoming edges; `G` then letter jumps to a group. Tab order alone is meaningless on a canvas.
- **Meaningful accessible names**: "billing-api, service, 2 violations, depends on 3, used by 5".
- **Live announcements** for agent activity: "Proposal ready: 3 changes" (polite), failures (assertive).
- WCAG 2.2 points that bite canvases **[M]**: 2.5.7 dragging movements need a non-drag alternative; 2.5.8 target size at least 24x24 CSS px; 2.4.11 focus not obscured by floating bars; 1.4.11 non-text contrast 3:1 for edges that carry meaning and for focus indicators; 1.4.1 no color-only status.

### 3.6 Performance budgets

React Flow guidance **[V]**: memoize custom nodes/edges (or use the React Compiler), memoize callbacks/objects passed to `<ReactFlow>`, do not subscribe components to the whole `nodes`/`edges` arrays, collapse large trees with `hidden`, and if still slow **simplify node styles: "animations, shadows, or gradients"**. `onlyRenderVisibleElements` has mixed reports (helps large graphs, can hurt pan/zoom); benchmark. **[S]**

Budgets to hold (targets, not measurements):
- Pan/zoom at 60 fps with 200 visible nodes on a mid laptop; no `backdrop-filter`, no large blur shadows and no CSS filter on nodes or edges.
- Interaction to next paint under 200 ms; input acknowledgement under 100 ms.
- First skeleton under 1 s; layout computed off the main thread (worker) for more than about 150 nodes.
- At most one infinite animation on screen at a time (the "agent working" indicator).

### 3.7 Reference products

- **Railway**: best reference for a "live system" canvas: cards with wordy status, groups, staged changes in purple with a banner and per-change discard. **[V]**
- **Grafana node graph**: stats inside the node, a colored arc ring for proportions, 200-node cap, grid fallback. **[V]**
- **tldraw / FigJam / Miro**: infinite canvas conventions (space-drag pan, Cmd-scroll zoom, zoom-to-fit `Shift+1`, zoom-to-selection `Shift+2`, minimap bottom corner, toolbar bottom center). **[M]**
- **Datadog service map, Kubernetes Lens**: health color on nodes, edge thickness for traffic; not verified this session. **[M]**

---

## 4. Presenting live status

### 4.1 Status vocabulary: glyph + label + color, always

Carbon's status-indicator pattern **[V]**: do not rely on color alone; aim for three of {symbol, shape, color, text}; indicators need 3:1 contrast against the background; shape indicators should have a text label; do not reuse one shape in several colors; when consolidating, show the highest-attention status; more than five or six indicators overwhelm; **skip the indicator when no user action is needed**. Apple HIG shows the same rule with a green circle-check next to a red octagon-X. **[V]**

Rassam vocabulary (five, no more):

| State | Glyph (lucide) | Shape | Label | Hue |
|---|---|---|---|---|
| Holds | `check` in circle | circle | "Holds" | green |
| Drift (warning) | `triangle-alert` | triangle | "Drift" | amber |
| Violation | `x` in octagon | octagon | "Violation" | red |
| Unknown / stale | `circle-dashed` or `clock` | dashed circle | "Not checked" / "Stale" | neutral gray |
| Proposed | `sparkle` / `plus` / `minus` / `pencil` | dashed outline | "Proposed" | accent |

The green/red/amber triple is distinguishable under deuteranopia/protanopia only by lightness and glyph, which is why the glyph and label are mandatory. Healthy nodes show **no badge at all** at glance level (absence of signal = fine); only the health pill says "holds".

### 4.2 Staleness

- Every status carries its **basis**: "checked at `fb8a685`, 2 min ago". Relative time for under 24 h, then a date.
- When the working tree or HEAD moves past the checked commit, statuses do not turn red; they **desaturate** and gain the dashed "stale" glyph, and the health pill becomes "Stale: N commits behind · Re-check". Stale must never look like healthy.
- While re-checking, keep the old result visible (dimmed) rather than blanking to skeletons.

### 4.3 History: commit-by-commit scrubber

- A horizontal **timeline strip** of commits (dot per commit, colored by gate result, glyph for violations) that opens from the health pill or `H`. Left/Right arrows step commits; Shift+arrow jumps to the next commit where status changed.
- Scrubbing puts the canvas in an explicit **"Viewing `1afabf7` (3 commits ago)"** mode with a persistent banner and a "Back to now" button; all editing is disabled in that mode. Time travel without a mode indicator is the classic trap.
- Compare mode: pick two points → the canvas shows the diff (below).
- Node positions are kept stable across commits (layout anchored to the latest), so the eye tracks change, not reshuffling.

### 4.4 Diff highlighting on a diagram

| Change | Treatment |
|---|---|
| Added | Solid 1.5 px green outline, faint green wash, `+` badge top-left. |
| Removed | Node stays in place at 45% opacity, dashed red outline, `−` badge, name struck through. Never just vanish. |
| Changed | Accent outline with a `~` badge (not amber, which is reserved for the Drift status); the inspector lists field-level before → after. |
| Unchanged | Dimmed to about 55% so the diff pops. |
| Edges | Same three treatments; added = solid, removed = dashed, with the glyph at the edge midpoint. |
| Proposed (not yet applied) | Same glyphs, but **dashed outline in accent** + "Proposed" label, at 85% opacity: clearly not real yet. |

While a diff or proposal is on screen, ordinary status colors on unchanged nodes are muted so two color systems never compete. A summary chip mirrors it in text: `+2  ~1  −1`.

### 4.5 Notification restraint

- No toasts for success of something the user just watched happen. A receipt row in history is enough; show a small inline "Applied · Undo" next to the intent bar instead.
- Toasts only for events that happened **off-screen or in the background** (agent finished, check failed), max one visible, never auto-stacking; Apple: prefer explicit dismissal over timers for anything the user must read. **[V]**
- No unread counters, no pulsing dots. One place shows "needs you": the intent bar gains a count chip ("2 proposals waiting").
- Sounds: none.

---

## 5. CSS / implementation notes (Tailwind v4 + React 19 + Next 16, late 2026)

### 5.1 Tokens

- Tailwind v4 is CSS-first: `@theme { --color-*: ...; --radius-*: ...; --ease-*: ...; --font-*: ... }` generates utilities and exposes the values as CSS variables. v4 is built on cascade layers, `@property` and `color-mix()`. **[S]** Default palette is OKLCH and opacity modifiers (`bg-accent/20`) compile to `color-mix(in oklab, ...)`. **[M]**
- Recommended structure: **primitive ladder in `:root`** (themeable, swappable for light / high-contrast) and **semantic aliases in `@theme inline`** so utilities like `bg-raised` resolve to variables at runtime. **[M]**
- Write colors as `oklch()`; all current engines support `oklch()` and `color-mix()` (Baseline 2023). **[M]** Out-of-gamut values are mapped by the browser; hex equivalents are listed in the brief for tools that need sRGB.
- Later Tailwind 4.x adds: 4.1 text-shadow and mask utilities; 4.2 logical-property utilities and four new neutral palettes (mauve, olive, mist, taupe); 4.3 scrollbar utilities. **[S]** Repo is on 4.1.18.
- Built-in variants to use: `motion-safe:` / `motion-reduce:`, `contrast-more:`, `forced-colors:`, `starting:` (`@starting-style`), container queries (`@container`, `@md:`), `focus-visible:`, `not-*`. There is no built-in variant for reduced transparency; add `@custom-variant transparency-reduce (@media (prefers-reduced-transparency: reduce));`. **[M]**

### 5.2 User-preference media queries

| Feature | Support | Use |
|---|---|---|
| `prefers-reduced-motion` | All engines for years. [M] | Mandatory. Replace movement with 120 ms opacity fades; stop infinite animations. |
| `prefers-contrast: more` | Chrome 96+, Firefox 101+, Safari 14.1+. [M] | Raise border and tertiary-text lightness, make glass opaque, thicker outlines. |
| `prefers-reduced-transparency` | **Chromium 118+ only.** Firefox behind a flag, Safari no support (caniuse, about 76% global). [V] | Progressive enhancement only. Also expose an in-app "Solid surfaces" toggle, because Safari/Firefox users cannot signal it. |
| `forced-colors: active` | Chromium, Firefox. [M] | Ensure status glyphs and focus rings use `currentColor` / system colors. |

### 5.3 View Transitions

- Same-document View Transitions: Chrome/Edge 111+, Safari 18+, **Firefox 144+**; about 93% global. **[V]**
- React's `<ViewTransition>` and `addTransitionType` are **stable as of React 19.3 (2026-09-09)**. **[S]** The Next 16.4.6 docs bundled in this repo say "View transitions work in the App Router with no configuration. React 19.3 includes the `<ViewTransition>` component" and that types / `view-transition-class` need Chromium 125+ "and recent Safari and Firefox versions", with "some animations may behave differently in Safari". **[R]** This repo pins `react 19.2.3`; the App Router uses Next's vendored React, so it probably works, but **spike it before depending on it** (or bump React to 19.3). Unverified here.
- Use for: route/tab changes, inspector open/close, timeline scrubbing cross-fades. **Do not** use for node movement inside React Flow (it snapshots the whole canvas; use transforms).

### 5.4 Overlays and positioning

- **Popover API** (`popover`, `popovertarget`) and `<dialog>`: Baseline in all engines. **[M]** Top-layer rendering removes z-index wars; the repo's `--layer-*` z-index tokens can mostly go.
- **CSS anchor positioning**: Chrome 125 (May 2024), Safari 26 (Sept 2025), Firefox 147 (2026-01-13) → Baseline newly available January 2026; cross-shadow-root anchoring still uneven. **[S]** Safe for menus/tooltips with a sensible unanchored fallback; keep a JS positioning library only if collision handling proves insufficient.
- `@starting-style` + `transition-behavior: allow-discrete` for enter/exit of popovers without JS. Baseline 2024. **[M]**
- **Container queries** (size): Baseline since 2023. **[M]** Use them for the inspector sheet and cards. Semantic zoom cannot be driven by container width (the canvas is transform-scaled); drive level of detail from the zoom value instead.

### 5.5 `backdrop-filter`

- Supported unprefixed in Chromium and Firefox 103+; Safari unprefixed from 18 per most sources, but keep `-webkit-backdrop-filter` (Tailwind emits both). **[S]**
- Cost scales with **area, radius, number of layers and how often the backdrop changes**; it is GPU-accelerated but not free; very laggy without GPU (remote desktop, some VMs). Do not animate blur over large areas. **[S]**
- Rules: at most **two** blurred surfaces on screen (intent bar, one floating panel); each under about 15% of the viewport; radius 16 to 24 px; never on nodes; never animate the radius (fade opacity of a pre-blurred layer instead); the canvas under glass keeps panning, so test pan fps with the bar visible. Provide the opaque fallback as the *base* style and add blur inside `@supports (backdrop-filter: blur(1px))`.

### 5.6 Motion: CSS first, library only where needed

- Motion (formerly Framer Motion) defaults per docs **[V]**: tween `duration 0.3 s`; spring `bounce 0.25`, `damping 10`, `mass 1`; recommended authoring is `visualDuration` + `bounce`. Reduced-motion handling (`MotionConfig reducedMotion="user"`) was not on the fetched page. **[M]**
- Recommendation: **no motion library for v1**. CSS transitions, `@starting-style`, `linear()` spring easings and View Transitions cover hover, press, popover, sheet, proposal ghosts and timeline cross-fades. Add `motion` (import from `motion/react`) only if layout animations of lists (reordering in the change list) cannot be done acceptably with View Transitions. Fewer dependencies also matters because `src/blueprint` and `src/cli` must stay dependency-light.
- Animate only `transform` and `opacity` (compositor-only). Never animate `width/height/top/left`, `box-shadow` spread, or `filter` on canvas children.

### 5.7 React 19 / Next 16 specifics **[M unless marked]**

- `useOptimistic` for apply (show applied state immediately, roll back on failure); `useTransition` for agent requests so the bar stays responsive; `useDeferredValue` for filter-as-you-type over the outline.
- React Compiler (stable since late 2025) removes most manual memoization that React Flow asks for **[V: React Flow docs recommend it]**; check whether it is enabled in this repo before adding `memo` everywhere.
- `next/font` to self-host Inter / Geist with `display: swap` and a metric-matched fallback to avoid layout shift.
- CLAUDE.md warns that this Next version has breaking changes: check `node_modules/next/dist/docs/` before using Next APIs. **[R]**
- `reactflow` v11 → `@xyflow/react` v12 migration is worth scheduling with the overhaul (better a11y config, SSR, dark-mode class, measured node sizes), but it is a code change outside these notes.

---

## Design brief for Rassam

Opinionated. Where a value is a judgment call rather than a sourced fact, it is still stated exactly so it can be implemented and then argued with.

### A. Product stance

Rassam's screen is **one live map and one sentence box**. The map answers "what is my system and does the contract hold?"; the box answers "change it". Everything else is one step behind those two. The user is a supervisor: the agent drafts, the canvas previews, the human applies. Manual editing stays, one level down, for correction.

### B. Information architecture

**First screen, no project (target: own repo on screen in < 60 s)**
- Centered: wordmark, one line of copy, one input: "Paste a GitHub URL, or drop a folder". Two secondary buttons: "Open local folder", "Try the sample".
- After input: canvas appears immediately with a skeleton; nodes stream in grouped by top-level directory; narration under the health pill ("Reading imports in src/cli ...").
- If `.rassam/blueprint.json` is missing, the agent drafts one and presents it as the **first proposal** (ghosted groups and rules) with Apply. Onboarding is the product loop itself; no tour, no modal.

**First screen, project open**
```
┌──────────────────────────────────────────────────────────────────────┐
│ [R] project ▾  staging @ fb8a685        ● Contract holds        ⋯    │  top bar: 44 px, transparent over canvas
│                                                                      │
│                                                                      │
│                         C A N V A S                                  │  full bleed, groups → components
│                (groups, components, dependencies)                    │
│                                                         ┌─────────┐  │
│                                                         │inspector│  │  only when something is selected
│                                                         │ sheet   │  │  360 px, right, dismiss with Esc
│  [− 100% +] [fit] [map]                                 └─────────┘  │
│              ┌────────────────────────────────────────────┐          │
│              │ ✦ Ask Rassam to add, remove or change …  ⌘K │          │  intent bar: bottom center, 640 px max
│              └────────────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────────────────┘
```
Always visible (5 things): project/branch/commit pill, **one health pill**, canvas, intent bar, zoom cluster.

**Behind one step (progressive disclosure)**

| Thing | Where it goes |
|---|---|
| Component detail (intent, owners, paths, rules, evidence) | Inspector sheet on selection. Sections collapsed except Intent and Status. |
| Violations / attention list | Opens from the health pill. Each row focuses its node. |
| Rules list, reach analysis, selectors | Inspector sections and `⌘K` → "Show rules for …". Not permanent tabs. |
| History / commit scrubber | `H` or health pill → "History". Strip docks above the intent bar. |
| Outline (accessible list/table view of the same model) | `⌘\` toggles canvas ⇄ list. Also the automatic view above ~200 nodes. |
| Manual edit tools (add component, draw dependency, rename, delete) | Context menu on canvas/node, `/` in the intent bar, and an "Edit" mode toggle in the `⋯` menu. |
| Export, blueprint JSON, settings, MCP setup, theme | `⋯` menu and `⌘K`. |
| Chat transcript | Gone as a panel. The intent bar expands upward into a compact thread of the current task only; older tasks are receipts in History. |
| Minimap | Hidden by default; toggle in zoom cluster; auto-suggest when the graph exceeds the viewport by 3x. |

### C. Intent bar behavior

**Anatomy.** A 48 px tall pill (radius 16), bottom center, max-width 640 px, glass-over-canvas with opaque fallback. Left: sparkle glyph (agent) that becomes a Stop button while running. Center: input. Right: scope chips, then key hint. Above it, when needed: suggestions, plan, or the proposal card (same width, grows upward to max 50vh).

**Invocation.** `⌘K` / `Ctrl+K` or `/` focuses it from anywhere; typing while a node is focused starts a scoped prompt. `Esc` steps back one level (proposal → composing → blurred).

**Scope.** Selected nodes/edges/groups appear as removable chips inside the bar ("billing-api ×"). `@` opens a component picker. No selection = whole system. Scope is always visible before sending.

**States**

| State | What the user sees | Timing |
|---|---|---|
| Idle | Placeholder rotates through 3 real examples for this repo. On focus: 3 to 5 suggestions ranked by context (violations first: "Fix the 2 violations in cli", "Explain why web cannot import github.ts", "Add a component for src/lib/llm"). | n/a |
| Composing | Input, scope chips, slash commands for manual verbs (`/add`, `/connect`, `/rename`, `/remove`, `/rule`). | n/a |
| Acknowledged | Bar shows specific narration ("Reading the blueprint and 14 files under src/cli"). Stop button. | ≤ 400 ms after Enter |
| Clarifying (only if ambiguous) | One question, 2 to 4 answer chips + free text. Never more than one question at a time. | n/a |
| Planning | One-line plan summary with step count ("3 steps · splitting cli into cli-core and cli-mcp"); chevron expands editable steps. Auto-collapsed. | streamed |
| **Proposal** | **On canvas:** ghost objects (dashed accent outline, `+` / `~` / `−` badges, removed items dimmed in place), unchanged nodes dimmed, camera eases to fit the changed region. **Above the bar:** proposal card: title, summary chip `+2 ~1 −1`, itemized change list; each row has a one-line reason, an evidence link ("7 imports"), and an `×` to drop that change. Rule-loosening rows are flagged with the warning glyph and the words "Loosens a rule". Footer: **Apply** (Enter) · **Refine** (keep typing) · **Discard** (Esc). | n/a |
| Applying | Ghosts solidify in place (opacity + outline transition, 220 ms). Optimistic; rolls back with an inline error on failure. | < 100 ms perceived |
| Applied | Inline receipt replaces the card: "Applied 3 changes to the draft · Undo (⌘Z)". No toast. Health pill re-evaluates and narrates ("Checking …" → result). | n/a |
| Failed / blocked | Plain sentence of what happened + next step ("That would let web import server credentials, which a rule forbids. Change the rule, or keep the dependency out?") with choice chips. | n/a |

**Guard tiers (reversibility decides friction)**
1. **Never ask**: read-only work (explain, find, focus, compare, show history, layout). Runs immediately; results are focus/highlight, not proposals.
2. **Propose → Apply**: any change to the draft blueprint (add/remove/rename components, dependencies, intent text, tightening rules). One key to apply, one to undo.
3. **Always confirm, explicitly, with the diff shown**: writing `.rassam/blueprint.json` to disk or a branch, opening a PR, deleting more than N components, and **anything that loosens a rule** (the repo's own policy requires a human-approved label for loosening edits). Confirmation is a real button with the consequence in its label ("Write blueprint to staging"), never a default-Enter.

Autonomy setting (in `⋯`): "Propose everything" (default) / "Auto-apply tier 2 changes that only add". Tier 3 can never be automated from the UI.

**One proposals inbox.** Proposals created by coding agents through the MCP server (`propose_change`) land in the same list as proposals made in the bar, with the author shown ("from a coding agent via MCP · 12 min ago"). The intent bar shows a count chip when any are waiting. Reviewing them uses the identical ghost preview + card.

**Undo / history.** `⌘Z` / `⌘⇧Z` operate on whole applied proposals and on manual edits in one stack. History lists receipts: time, author (human or which agent), summary chip, "Revert" and "View diff". Reverting is itself a tier-2 action with its own undo.

**Manual control (secondary, complete).** Double-click canvas = add component (inline name field). Drag from node edge = dependency. `F2` rename, `Delete` remove (creates an undoable change, no dialog), right-click = context menu with the same verbs as slash commands. Manual edits go through the same change model, so they appear in History and can be undone identically.

### D. Visual token set (exact values)

Dark is the default theme. Hex values are the sRGB rendering of the OKLCH source (computed for these notes; a few high-chroma values are slightly outside sRGB and shown clipped); contrast ratios are WCAG 2.x, computed.

**Color: surfaces (neutral hue 260, chroma ≤ 0.009)**

| Token | OKLCH | Hex | Use |
|---|---|---|---|
| `--bg-canvas` | `oklch(0.145 0.004 260)` | `#090a0c` | Canvas, page |
| `--bg-base` | `oklch(0.178 0.005 260)` | `#101113` | Group containers, list view |
| `--bg-raised` | `oklch(0.215 0.006 260)` | `#181a1c` | Nodes, cards, inspector |
| `--bg-overlay` | `oklch(0.25 0.007 260)` | `#202225` | Intent bar, popovers, menus |
| `--bg-hover` | `oklch(0.285 0.008 260)` | `#282a2e` | Hover fill |
| `--bg-active` | `oklch(0.32 0.009 260)` | `#303338` | Pressed / selected fill |
| `--border-subtle` | `oklch(0.27 0.007 260)` | `#24272a` | Hairlines between regions (decorative) |
| `--border-default` | `oklch(0.33 0.008 260)` | `#33353a` | Card and node outline (decorative) |
| `--border-strong` | `oklch(0.56 0.010 260)` | `#71757a` | Input and control boundaries: 3.76:1 on raised, 4.25:1 on canvas, 3.44:1 on overlay (meets 3:1 non-text) |

**Color: text**

| Token | OKLCH | Hex | Contrast (canvas / raised / overlay) |
|---|---|---|---|
| `--text-primary` | `oklch(0.96 0.003 260)` | `#f0f2f4` | 17.6 / 15.6 / 14.2 |
| `--text-secondary` | `oklch(0.80 0.006 260)` | `#bbbec2` | 10.6 / 9.4 / 8.6 |
| `--text-tertiary` | `oklch(0.68 0.008 260)` | `#95989d` | 6.9 / 6.1 / 5.6 (5.0 on hover). Lowest text color allowed. |
| `--text-disabled` | `oklch(0.50 0.008 260)` | `#616368` | 2.9 on raised: disabled controls only, never information |

**Color: accent (one hue, iris 285).** Chosen to be far from every status hue so "interactive / proposed / agent" never reads as "healthy".

| Token | OKLCH | Hex | Use |
|---|---|---|---|
| `--accent` | `oklch(0.72 0.15 285)` | `#9c95fe` | Primary button fill, focus ring, selection outline, proposal outline. 7.7:1 on canvas, 6.8:1 on raised. |
| `--accent-hover` | `oklch(0.77 0.13 285)` | `#aca8ff` | Hover of the above |
| `--accent-text` | `oklch(0.82 0.10 285)` | `#bdbbff` | Links, accent text on dark (9.8:1 on raised) |
| `--accent-muted` | `oklch(0.32 0.07 285)` | `#302d55` | Selected-row / proposal wash; accent-text on it 7.2:1 |
| `--on-accent` | `oklch(0.16 0.02 285)` | `#0c0c16` | Text on accent fill: 7.5:1 (**dark text; white on accent is only 2.3:1**) |

**Color: status (always with glyph + label)**

| Token | OKLCH | Hex | On raised | Tinted background token, hex, and contrast on it |
|---|---|---|---|---|
| `--status-ok` | `oklch(0.80 0.16 150)` | `#66da85` | 9.9:1 | `--status-ok-bg` `oklch(0.27 0.05 150)` `#122d19` · 8.4:1 |
| `--status-warn` | `oklch(0.83 0.15 80)` | `#fabb41` | 10.2:1 | `--status-warn-bg` `oklch(0.28 0.05 80)` `#362607` · 8.6:1 |
| `--status-bad` | `oklch(0.72 0.18 25)` | `#ff6f69` | 6.4:1 | `--status-bad-bg` `oklch(0.27 0.06 25)` `#3f1917` · 5.7:1 |
| `--status-unknown` | `oklch(0.68 0.008 260)` | `#95989d` | 6.1:1 | none (dashed outline) |

Diff reuses these: added = ok, removed = bad, changed = accent; proposed = accent, dashed.

**Light theme (secondary, same structure).** canvas `#f5f7f9`, base `#fbfcfd`, raised `#ffffff`; text `#16181c` (16.5:1), `#4a4d53` (7.9:1), `#656970` (5.1:1 on canvas); border `#dcdee1`, strong `#7d8086` (3.95:1); accent `oklch(0.52 0.19 285)` `#634ecf` with white text (5.9:1); ok `#007834`, warn `#945a00`, bad `#c51d28` (all ≥ 5.2:1 on canvas).

**High contrast (`prefers-contrast: more` or in-app toggle).** `--text-tertiary` → value of secondary; `--border-default` → value of strong; `--border-strong` → `oklch(0.75 0.01 260)`; all glass opaque; focus ring 3 px.

**Accent usage rules.** Accent appears on: the single primary action in view, focus rings, current selection, proposals/agent activity, links. Nowhere else. No accent backgrounds on panels, no accent icons for decoration. If two accent things compete on one screen, one of them is wrong. Status hues appear only on things that have that status; a healthy node is neutral.

**Typography**

- Sans: `"Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` loaded with `next/font` (Inter is what Linear and NVIDIA Elements use; plain `system-ui` would give SF on macOS but Segoe UI on Windows, so it cannot deliver one look). Geist Sans is an acceptable swap; do not mix both.
- Mono: `"Geist Mono", "JetBrains Mono", ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace` for paths, commit hashes, selectors, code.
- Features: `font-variant-numeric: tabular-nums` on counts, hashes and times; `-webkit-font-smoothing: antialiased` in dark theme.
- Weights: 400 body, 500 labels/controls/node names, 600 headings. Nothing lighter than 400, nothing heavier than 600.

| Token | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|
| `--text-xs` | 12 / 16 | 500 | +0.01em | Badges, key hints, meta. Minimum size anywhere. |
| `--text-sm` | 13 / 18 | 400 | 0 | Secondary text, inspector rows, node subtitle |
| `--text-base` | 14 / 20 | 400 | −0.006em | Default UI and body |
| `--text-md` | 16 / 24 | 400 | −0.011em | Intent bar input, proposal titles |
| `--text-lg` | 20 / 28 | 600 | −0.017em | Sheet and section headings |
| `--text-xl` | 28 / 34 | 600 | −0.021em | Empty-state headline |
| `--text-2xl` | 40 / 44 | 600 | −0.024em | Landing / first-run only |

Line length for prose (intent, rule rationale): max 68ch.

**Spacing (4 px base; Tailwind `--spacing: 0.25rem`).** Allowed steps: 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64. Inside controls 8/12; between related items 8; between groups 16; panel padding 16; section gaps 24; canvas-edge inset for floating UI 16.

**Radii.** `--radius-xs 4px` (badges, key caps) · `--radius-sm 6px` (small controls, menu items) · `--radius-md 8px` (buttons, inputs) · `--radius-lg 12px` (nodes, cards, menus) · `--radius-xl 16px` (intent bar, sheets, dialogs) · `--radius-2xl 20px` (group containers) · `--radius-full 9999px` (pills). Nested corners are concentric: inner radius = outer radius − padding.

**Sizes.** Control heights 28 (compact, canvas toolbars) / 32 (default) / 40 (primary, dialogs) / 48 (intent bar). Minimum hit target 24x24 with 8 px gaps; icon buttons 32x32. Icons: lucide, 16 px at 1.5 stroke in controls, 14 px in badges, 20 px in empty states. Node card: 220 px wide, min-height 64, padding 12. Inspector 360 px. Top bar 44 px.

**Borders and elevation (dark).** Depth comes from the surface ladder first, then a 1 px edge, then shadow. Shadows are single, soft and neutral; no colored glows.

```css
--elev-0: none;                                             /* canvas, groups */
--elev-1: 0 0 0 1px var(--border-default),
          0 1px 2px oklch(0 0 0 / 0.40);                    /* nodes, cards */
--elev-2: 0 0 0 1px oklch(1 0 0 / 0.08),
          inset 0 1px 0 oklch(1 0 0 / 0.06),
          0 8px 24px -6px oklch(0 0 0 / 0.55);              /* menus, popovers, inspector */
--elev-3: 0 0 0 1px oklch(1 0 0 / 0.10),
          inset 0 1px 0 oklch(1 0 0 / 0.08),
          0 24px 64px -12px oklch(0 0 0 / 0.70);            /* intent bar, dialogs */
--ring-focus: 0 0 0 2px var(--bg-canvas), 0 0 0 4px var(--accent);   /* two-tone, visible on any surface */
--ring-selected: 0 0 0 1.5px var(--accent);
```
Nodes use `--elev-1` only (React Flow: shadows on many nodes are a known cost; if a 200-node pan drops frames, replace the node shadow with the 1 px edge alone).

**Glass (functional layer only).**
```css
.glass {                                                    /* base = opaque fallback */
  background: var(--bg-overlay);
}
@supports (backdrop-filter: blur(1px)) {
  .glass {
    background: color-mix(in oklch, var(--bg-overlay) 76%, transparent);
    -webkit-backdrop-filter: blur(20px) saturate(1.4);
    backdrop-filter: blur(20px) saturate(1.4);
  }
}
@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
  .glass { background: var(--bg-overlay); -webkit-backdrop-filter: none; backdrop-filter: none; }
}
:root[data-solid="true"] .glass { background: var(--bg-overlay); -webkit-backdrop-filter: none; backdrop-filter: none; }
```
Allowed on: intent bar, top bar pills, one floating popover. The 76% tint is a starting value: measure text contrast over the brightest thing that can sit beneath it (a status-warn wash) and raise the tint until it stays above 4.5:1. Never on nodes, inspector body, lists, or anything containing more than two lines of text.

**Edges (canvas).** Default 1.25 px `--border-strong` at 55% opacity, smooth-step, arrowhead 6 px. Hover/selected endpoint: 1.75 px `--text-secondary`; unrelated nodes and edges fade to 35%. Violating dependency: `--status-bad`, 1.75 px, with the `x` glyph at midpoint (not just red). Proposed: accent, dashed `4 4`.

**Tailwind wiring (sketch).**
```css
@import "tailwindcss";
:root { color-scheme: dark; /* primitives above */ }
:root[data-theme="light"] { color-scheme: light; /* light primitives */ }
@theme inline {
  --color-canvas: var(--bg-canvas);   --color-base: var(--bg-base);
  --color-raised: var(--bg-raised);   --color-overlay: var(--bg-overlay);
  --color-fg: var(--text-primary);    --color-fg-2: var(--text-secondary);  --color-fg-3: var(--text-tertiary);
  --color-line: var(--border-default); --color-line-strong: var(--border-strong);
  --color-accent: var(--accent);      --color-on-accent: var(--on-accent);
  --color-ok: var(--status-ok);       --color-warn: var(--status-warn);     --color-bad: var(--status-bad);
  --radius-md: 8px; --radius-lg: 12px; --radius-xl: 16px;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
}
@custom-variant transparency-reduce (@media (prefers-reduced-transparency: reduce));
```
Delete the hand-copied `--color-slate-*` / `--color-blue-*` block in `globals.css`; components should reference semantic tokens only.

### E. Motion rules

**Durations.** `--dur-1 100ms` (hover, press, color) · `--dur-2 160ms` (popover, menu, tooltip, chip) · `--dur-3 220ms` (sheet, proposal card, ghost solidify) · `--dur-4 320ms` (camera fit-to-changes, timeline cross-fade) · `--dur-5 480ms` (first-run map reveal only). Nothing in routine use exceeds 320 ms.

**Easings.** Enter and most UI: `--ease-out cubic-bezier(0.16, 1, 0.3, 1)`. Exit: `--ease-in cubic-bezier(0.4, 0, 1, 1)` at 0.75x the enter duration. Moves that stay on screen (camera, node reposition): `--ease-in-out cubic-bezier(0.65, 0, 0.35, 1)`. If a spring is used (Motion): `{ type: "spring", visualDuration: 0.25, bounce: 0 }` for panels, `bounce: 0.15` maximum, and only for direct-manipulation release (dropping a node).

**Rules.**
1. Motion must answer "what changed?" or "where did it go/come from?". Otherwise remove it.
2. Animate `transform` and `opacity` only. Never blur radius, never box-shadow size, never layout properties.
3. Enter from the trigger: popovers scale 0.97 → 1 with origin at the anchor; the inspector slides 12 px + fades; the proposal card grows upward from the bar.
4. No bounce on utility UI. No staggered list entrances beyond 5 items x 20 ms.
5. One infinite animation maximum: the agent-working indicator (a 1.2 s opacity breathe on the sparkle). Status never pulses.
6. Camera moves only when the user asked for something (apply, focus, fit) and never more than once per action; 320 ms, interruptible by any pointer input.
7. Layout stability: nothing in the persistent chrome changes size or position when state changes. Proposal card and thread grow upward over the canvas; they never push anything.
8. `prefers-reduced-motion: reduce`: all transforms removed, 120 ms opacity cross-fades only, camera jumps (no pan animation), breathe indicator becomes a static glyph + text "Working…".

### F. Accessibility rules

1. **Contrast**: text ≥ 4.5:1 (the token table guarantees ≥ 5.0:1 down to tertiary-on-hover); meaningful non-text (control boundaries, status glyphs, focus rings, violating edges) ≥ 3:1. Decorative hairlines are exempt but must not be the only boundary of an input.
2. **Never color alone**: every status and every diff state has a glyph and a text label; edges carry a midpoint glyph when they mean something.
3. **Focus**: always-visible two-tone `--ring-focus` on `:focus-visible`; floating bars must not cover the focused element (pan into view with 24 px margin).
4. **Keyboard completeness**: every action reachable without a pointer. `⌘K` intent bar · `⌘\` canvas ⇄ list · arrows = spatial focus move · `]` `[` follow dependency out/in · `Enter` open inspector · `Esc` back out one level · `H` history · `Shift+1` fit · `Shift+2` fit selection · `⌘Z` undo · `?` shortcut sheet. Dragging always has a non-drag alternative (slash commands, context menu).
5. **Screen readers**: the list view is the canonical accessible representation (a tree/grid of groups → components with status and dependency counts). Canvas nodes get full accessible names. Agent state changes go to a polite live region ("Proposal ready, 3 changes"); failures to an assertive one. The proposal card is a labelled region whose change list is a real list with per-item "remove from proposal" buttons.
6. **Targets**: ≥ 24x24 CSS px with ≥ 8 px spacing; default controls 32 px.
7. **Preferences honored**: reduced motion, increased contrast, reduced transparency (plus the in-app "Solid surfaces" switch because Safari and Firefox do not expose that preference), forced colors, 200% zoom without loss of function (inspector becomes a full-width sheet under 720 px container width).
8. **No timed dismissal** for anything that must be read or acted on. The inline "Applied · Undo" receipt persists until the next action; background toasts stay until dismissed.
9. **AI disclosure and fallback**: agent-authored proposals and receipts are labelled with their author; with no model configured or offline, the bar still works as a command palette for the manual verbs and navigation.
10. **Language**: plain sentences, no internal jargon in status text ("web imports a server-only module", not a rule ID alone).

### G. Remove from the workbench

Named after components seen in the repo (by filename only; confirm against actual behavior before deleting).

1. **Activity bar** (VS Code-style icon rail) → remove. Its destinations move to `⌘K` and the `⋯` menu.
2. **Permanent tab strip** (Attention / Components / Intent / Reach / Rules) → remove as tabs. Attention becomes the health pill's list; Components becomes the list view; Intent, Rules and Reach become sections of the inspector for the selected thing.
3. **Edit toolbar** on the canvas → remove from default view; manual verbs live in the context menu, slash commands and the optional Edit mode.
4. **Separate export panel** → one menu item ("Export…") with a small dialog.
5. **Graph outline as a docked panel** → replaced by the toggled list view.
6. **Docked chat sidebar** → replaced by the intent bar and its upward thread; no persistent transcript column.
7. **Standalone command palette** → merged into the intent bar (one input for commands and intents).
8. **Workspace status bar / multiple status badges** → one health pill.
9. **Edge prompt and selector-picker dialogs as first-class steps** → the agent proposes selectors and dependency reasons; the pickers survive only inside the inspector's advanced section.
10. **Flow controls cluster** → reduce to zoom −/%/+, fit, minimap toggle. Lock/interactive toggles go to the menu.
11. **Persistence-conflict and storage-recovery banners** → route through the same single "needs you" surface (intent bar chip + one sheet), not separate banners.
12. **Borders around every panel, splitters, resizable multi-pane layout** → one canvas, one floating bar, one optional sheet.
13. **Icon-only buttons without labels or key hints**, colored icon tiles, per-kind rainbow node colors (kind = icon + label; color is reserved for status and proposals).
14. **Confirmation dialogs for reversible actions** → undo instead.
15. **Success toasts** for visible actions, unread dots, spinners without text.
16. The **cyan accent `#22b8cf`** and the blue-tinted slate ladder → replaced by the neutral ladder and iris accent above (cyan sits close to an "info/running" status hue and to the green of "holds").

### H. Definition of done (testable)

- New user reaches a colored map of their own repo in < 60 s with zero settings touched.
- "Add a component for X" → ghost preview in < 5 s typical, Enter applies, `⌘Z` restores the exact prior state.
- With nothing selected, the screen shows at most 5 persistent UI elements.
- Every status is identifiable in a grayscale screenshot.
- Full propose → apply → undo loop completes with keyboard only and with a screen reader using the list view.
- 200-node graph pans at 60 fps with the intent bar visible.
- With reduced motion + increased contrast + solid surfaces on, nothing is lost but movement and blur.
- No text below 12 px; no text/background pair below 4.5:1 (automated check over the token table).

---

## Could not verify (summary)

- Google PAIR guidebook content (fetch returned only the title); summarized from memory.
- Exact wording of the 18 HAX guidelines (structure verified, wording from memory of the CHI 2019 paper).
- NVIDIA "Kaizen" as a public design system: only an NVIDIA-hosted stylesheet name was found; public tokens come from NVIDIA Elements. `#76B900` as the official brand hex is from memory.
- Vercel Geist raw color values and type scale; Stripe and Raycast specifics; Datadog service map and Kubernetes Lens specifics.
- Apple default spring parameters; WWDC25 session details beyond a third-party memo.
- tldraw agent accept/reject mechanics; Cursor's current review defaults (forum reports only); GitHub Agent HQ after Oct 2025; Copilot Workspace status; Notion AI, Arc, Raycast, Claude artifacts details.
- Whether `<ViewTransition>` works in this repo as pinned (`react 19.2.3` with Next 16.4.6's vendored React): needs a spike.
- Whether this repo's React Flow v11 supports `ariaLabelConfig` / `autoPanOnNodeFocus` (documented for v12).
- Safari's unprefixed `backdrop-filter` status (sources conflict; keep the `-webkit-` prefix).
- Semantic-zoom thresholds, the performance budgets and the glass tint percentage are engineering judgment, not sourced measurements.
- Browser-support statements marked [M] (prefers-contrast, popover, `@starting-style`, container queries, `linear()`), and the Tailwind variant names marked [M].
- The existing workbench was judged from component filenames, not from running the app.

## Sources

Research and guidelines
- NN/g, "AI: First New UI Paradigm in 60 Years": https://www.nngroup.com/articles/ai-paradigm/
- Jakob Nielsen, "Intent by Discovery: Designing the AI User Experience" (2026-03-26): https://jakobnielsenphd.substack.com/p/intent-ux
- NN/g, "Liquid Glass Is Cracked, and Usability Suffers in iOS 26" (2025-10-10): https://www.nngroup.com/articles/liquid-glass/
- Microsoft, Guidelines for Human-AI Interaction / HAX Toolkit: https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/ and https://www.microsoft.com/en-us/research/publication/guidelines-for-human-ai-interaction/
- Magentic-UI (arXiv 2507.22358): https://arxiv.org/html/2507.22358v1 ; blog: https://www.microsoft.com/en-us/research/blog/magentic-ui-an-experimental-human-centered-web-agent/
- DirectGPT (CHI 2024): https://arxiv.org/abs/2310.03691
- Kim et al., intent communication with generative AI: https://arxiv.org/abs/2507.22134
- Google PAIR Guidebook: https://pair.withgoogle.com/guidebook/
- Linear Agent Interaction Guidelines: https://linear.app/developers/aig
- GuidelineExplorer (node-link guidelines): https://arxiv.org/abs/2406.05558
- Huang et al., eye tracking and edge crossings: https://arxiv.org/abs/0810.4431
- Dunne and Shneiderman, readability metrics: https://www.cs.umd.edu/users/ben/papers/Dunne2009Improving.pdf
- IBM Carbon, status indicator pattern: https://carbondesignsystem.com/patterns/status-indicator-pattern/

Apple
- HIG Generative AI: https://developer.apple.com/design/human-interface-guidelines/generative-ai
- HIG Materials: https://developer.apple.com/design/human-interface-guidelines/materials
- HIG Accessibility: https://developer.apple.com/design/human-interface-guidelines/accessibility
- HIG Typography: https://developer.apple.com/design/human-interface-guidelines/typography
- WWDC25 "Meet Liquid Glass": https://developer.apple.com/videos/play/wwdc2025/219

Design systems and product posts
- NVIDIA Elements DESIGN.md: https://nvidia.github.io/elements/DESIGN.md
- Linear, "How we redesigned the Linear UI (part II)": https://linear.app/now/how-we-redesigned-the-linear-ui
- Linear, "Behind the latest design refresh" (2026-03-12): https://linear.app/now/behind-the-latest-design-refresh
- Vercel Geist colors: https://vercel.com/geist/colors
- Railway staged changes: https://docs.railway.com/deployments/staged-changes ; smart canvas changelog: https://railway.com/changelog/2025-12-05-smart-canvas ; projects: https://docs.railway.com/projects
- Google Antigravity docs: https://www.antigravity.google/docs/artifacts , https://www.antigravity.google/docs/implementation-plan
- Devin 2.1 (confidence): https://cognition.ai/blog/devin-2-1 ; interactive planning: https://docs.devin.ai/work-with-devin/interactive-planning
- GitHub Agent HQ: https://github.blog/news-insights/company-news/welcome-home-agents/
- Figma Make: https://help.figma.com/hc/en-us/articles/31304485164695 ; v0 design mode: https://community.vercel.com/t/edit-ui-with-v0s-design-mode/17477
- tldraw agent starter kit: https://tldraw.dev/starter-kits/agent
- Cursor forum (review regression): https://forum.cursor.com/t/bring-back-per-change-apply-inline-diff-review-you-re-throwing-away-your-best-ux-advantage/160856
- Grafana node graph: https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/node-graph/

Implementation
- React Flow accessibility: https://reactflow.dev/learn/advanced-use/accessibility ; performance: https://reactflow.dev/learn/advanced-use/performance
- caniuse View Transitions: https://caniuse.com/view-transitions ; prefers-reduced-transparency: https://caniuse.com/mdn-css_at-rules_media_prefers-reduced-transparency ; anchor positioning: https://caniuse.com/css-anchor-positioning
- web.dev, platform news January 2026 (anchor positioning Baseline): https://web.dev/blog/web-platform-01-2026
- React 19.3 release: https://react.dev/blog/2026/09/09/react-19-3 ; `<ViewTransition>`: https://react.dev/reference/react/ViewTransition
- Next.js view transitions guide (local copy): `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`
- Motion transitions: https://motion.dev/docs/react-transitions ; performance tier list: https://motion.dev/blog/web-animation-performance-tier-list
- backdrop-filter: https://web.dev/articles/backdrop-filter , https://developer.mozilla.org/docs/Web/CSS/backdrop-filter , https://developer.chrome.com/blog/animated-blur/
- Tailwind CSS v4.1 / v4.3: https://tailwindcss.com/blog/tailwindcss-v4-1 , https://tailwindcss.com/blog/tailwindcss-v4-3
