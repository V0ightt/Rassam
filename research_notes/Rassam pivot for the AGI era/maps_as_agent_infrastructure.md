# Structured Codebase/System Maps as Infrastructure for AI Agents and Multi-Agent Coordination (as of 2026-11-19)

Scope note: Research done 2026-11-19. Web search budget ran out partway through, so a few sub-topics (GraphRAG/LightRAG for code, CodeQL/Joern, Honeycomb, Structurizr/C4 "architecture as code", Moatless, CodeRAG, 2026 frontier-model 1M-context coding evals) are only partly covered or not covered. These are listed under Gaps. Numbers marked "(snippet)" come from search-engine summaries of the primary source, not from full-text reading. Treat them as slightly less certain.

---

## 1. Do structured repo representations (graphs, maps) measurably improve agent performance?

### Takeaway
Yes, but the gains are modest and concentrated in specific places. Code graphs reliably improve **localization** (finding the right file or function) and **cost/token efficiency**. End-to-end issue resolution rises by only about 2–3 percentage points in controlled add-on studies with 2024-era models. Weaker and open models gain much more than frontier models. Strong counter-evidence also exists: frontier agents using only bash/grep (mini-SWE-agent >74% on SWE-bench Verified) and Claude Code's choice of agentic search over vector RAG both show that structure is not *necessary* for high success. Structure's clearest, repeated win is doing the same work with roughly 2–10x fewer tokens and tool calls.

### Cited Findings
**Graph add-on studies (controlled with vs. without)**
- **RepoGraph (ICLR 2025; arXiv 2410.14684, Oct 2024).**
  - Construction: a line-level graph built with tree-sitter. Nodes are "def"/"ref" code lines; edges are "contain" and "invoke". Built-in, stdlib, and third-party calls are filtered out. The average repo graph has about 1,419 nodes and 26,392 edges. Retrieval returns the k-hop ego-graph around a search term. — [RepoGraph arXiv HTML](https://arxiv.org/html/2410.14684v2); [ICLR 2025 proceedings](https://proceedings.iclr.cc/paper_files/paper/2025/hash/4a4a3c197deac042461c677219efd36c-Abstract-Conference.html)
  - SWE-bench Lite resolve rates, baseline → +RepoGraph:
    - RAG/GPT-4: 2.67% → 5.33%
    - Agentless/GPT-4o: 27.33% → 29.67%
    - AutoCodeRover/GPT-4: 19.00% → 21.33%
    - SWE-agent/GPT-4o: 18.33% → 20.33%
    - Agentless/Claude-3.5-Sonnet: 27.67% → 30.33%
    - SWE-agent/Claude-3.5-Sonnet: 23.00% → 25.33%
    - Absolute gains are +2.0 to +2.7 pp. The headline "32.8% average relative improvement" across the four GPT-based systems is inflated by the weak RAG baseline doubling. — [RepoGraph](https://arxiv.org/html/2410.14684v2)
  - Cost per instance rises modestly: Agentless $0.34 → $0.39; AutoCodeRover $0.45 → $0.58; SWE-agent $2.53 → $2.69. — [RepoGraph](https://arxiv.org/html/2410.14684v2)
  - More graph context can hurt. Flattened 1-hop context (avg 2,311 tokens) gave 29.67%, while flattened 2-hop (avg 10,505 tokens) dropped to 26.00%. A summarized 2-hop version (avg 1,229 tokens) recovered to 28.67%. — [RepoGraph](https://arxiv.org/html/2410.14684v2)
  - On CrossCodeEval (Python, 2,665 samples), GPT-4o exact match went from 10.5 to 28.7 with RepoGraph, and identifier EM from 16.8 to 36.0. — [RepoGraph](https://arxiv.org/html/2410.14684v2)
- **LocAgent (arXiv 2503.09089, Mar 2025; ACL 2025 long paper).**
  - Parses repos into "directed heterogeneous graphs" of files, classes, and functions, with import, invocation, and inheritance edges. — [LocAgent abs](https://arxiv.org/abs/2503.09089); [ACL 2025 PDF](https://preview.aclanthology.org/iwcs-25-ingestion/2025.acl-long.426.pdf)
  - Reaches up to 92.7% file-level localization accuracy with a fine-tuned Qwen-2.5-Coder-32B, improves downstream issue resolution by 12% at Pass@10, and costs about 86% less than proprietary-model SOTA. — [LocAgent abs](https://arxiv.org/abs/2503.09089)
  - A competing paper reproduces LocAgent's SWE-bench Lite numbers: 77.74% file Acc@1 for LocAgent with Claude-3.5 versus 72.63% for Agentless with Claude-3.5. — [SWE-Debate, arXiv 2507.23348](https://arxiv.org/pdf/2507.23348) (snippet; secondary reproduction)
- **KGCompass (arXiv 2503.21710, 2025, multiple revisions).**
  - A repository-aware knowledge graph linking issues, PRs, and code entities. It narrows candidate functions "from thousands to just 20". — [KGCompass v3](https://arxiv.org/html/2503.21710v3) (snippet)
  - v1: 45.67% on SWE-bench Lite with Claude 3.5 Sonnet at about $0.20 per repair. Latest version: 58.3% repair and 56.0% function-level localization with Claude-4 Sonnet. — [KGCompass v1](https://arxiv.org/html/2503.21710v1); [v3](https://arxiv.org/html/2503.21710v3) (snippet)
  - Relative improvement over pure-LLM baselines: +50.8% for Claude-4 Sonnet, +30.2% for Claude-3.5 Sonnet, +115.7% for DeepSeek-V3, and +156.4% for Qwen2.5-Max. — [KGCompass v3](https://arxiv.org/html/2503.21710v3) (snippet)
- **OrcaLoca (arXiv 2502.00350, Feb 2025).** On SWE-bench Lite: 65.33% function match (196/300), 83.33% file match, and 41.00% resolved. It combines action scheduling, hierarchical decomposition, and a context manager that prunes irrelevant information. — [OrcaLoca](https://arxiv.org/html/2502.00350v2) (snippet)
- **CodexGraph (arXiv 2408.03910, Aug 2024).** Stores the repo in a graph database that the LLM queries. It was evaluated on only 257 of 300 SWE-bench Lite instances because some Sympy samples ran out of memory during indexing, which is an early scale warning. Qwen2 reached 22.96 Pass@1, on par with AutoCodeRover. — [CodexGraph](https://arxiv.org/pdf/2408.03910) (snippet)
- **Code Graph Model, CGM (arXiv 2505.16901, May 2025).** Builds the repository code graph into the LLM's attention through an adapter. With Qwen2.5-72B and an agentless graph-RAG pipeline it reached 43.00% on SWE-bench Lite: first among open-weight models, 8th overall, and +12.33 pp over the previous best open-model method. — [CGM abs](https://arxiv.org/abs/2505.16901)
- **Agentless (arXiv 2407.01489, Jul 2024).** A fixed three-phase pipeline of localization, repair, and patch validation, with no autonomous tool choice. It reached 32.00% (96/300) on SWE-bench Lite at a reported cost of $0.70. — [Agentless abs](https://arxiv.org/abs/2407.01489)
- **Aider repo map (production tool).**
  - Sends a concise map with each request, listing the most important classes and functions with "types and call signatures".
  - Files are ranked by a graph-ranking algorithm over file dependency edges.
  - The default budget is `--map-tokens` 1k, and the map expands dynamically when no files are in the chat.
  - The docs give no quantitative benefit. — [Aider repo map docs](https://aider.chat/docs/repomap.html)

**Efficiency-focused evidence (graph via MCP vs. grep/read exploration)**
- **Codebase-Memory (arXiv 2603.27277, Mar 28 2026).**
  - A tree-sitter graph in SQLite covering 66 languages, exposed through 14 MCP tools.
  - Setup: an MCP agent compared with a grep/read "Explorer" agent, both on Claude Opus 4.6, across 31 languages and 12 question categories.
  - Results:
    - Quality: 0.83 vs. 0.92, so the graph agent reached 90% of the Explorer's quality.
    - Tool calls per question: 2.3 vs. 4.8.
    - Tokens per question: about 1,000 vs. about 10,000.
    - Query latency: under 1 ms vs. 10–30 s.
  - The graph agent matched or beat the Explorer on hub detection and caller ranking in 19 of 31 languages. The Explorer led on full-source-context and exhaustive call-site questions. On macro-heavy C the graph agent scored 0.58 vs. 1.00.
  - Grading was done by a single author. — [Codebase-Memory](https://arxiv.org/html/2603.27277v1)
- **Cursor semantic search (blog, Nov 6 2025).**
  - Adding semantic (embedding) search to grep raised codebase-question accuracy by an average of 12.5% (6.5%–23.5% depending on the model). The gain was largest on repos with 1,000+ files.
  - In online A/B tests, code retention rose 0.3% with semantic search, and dissatisfied follow-ups were 2.2% higher without it.
  - This is self-reported on an internal benchmark ("Cursor Context Bench"). — [Cursor blog](https://cursor.com/blog/semsearch); [Cursor docs](https://cursor.com/docs/agent/tools/search.md) (snippet)
- **Self-reported graph-MCP token savings (not independently verified):**
  - Bikach/codeGraph (Neo4j) claims 40–50% fewer LLM calls, tokens, and cost than Glob/Grep/Read on a Kotlin/Quarkus backend. — [codeGraph](https://github.com/Bikach/codeGraph)
  - A Codebase-Memory author post claims about 3,400 vs. about 412,000 tokens (121x) across five queries. — [dev.to post](https://dev.to/deusdata/how-i-cut-my-ai-coding-agents-token-usage-by-120x-with-a-code-knowledge-graph-4a3d)
  - LeanKG claims up to 98% reduction on impact-analysis queries. — [LeanKG](https://docs.rs/crate/leankg/0.12.3)
  - An independent review of another CodeGraph tool noted its figures "remain unverified by independent reproduction". — [pantheon-org review](https://pantheon-org.github.io/agentic-context/analysis/colbymchenry-codegraph/)

**Counter-evidence**
- **Claude Code.** Creator Boris Cherny has said early versions used RAG with a local vector DB, but agentic search (grep/glob/find) "generally works better". The team also tried "recursive model-based indexing". Downsides cited: stale indexes and permission complexity. — [Pragmatic Engineer interview](https://newsletter.pragmaticengineer.com/p/building-claude-code-with-boris-cherny); [secondary summary](https://smartscope.blog/en/ai-development/practices/rag-debate-agentic-search-code-exploration/) (secondary sources; original post not read)
- **mini-SWE-agent.** About 100 lines of Python, no tools other than bash, linear message history. The README claims ">74% on SWE-bench verified"; the model is not named on that page. — [mini-SWE-agent README](https://github.com/SWE-agent/mini-swe-agent)
- Comparisons across graph papers are confounded. They use different metrics (function match, resolve %, Pass@1, Recall@1), different subsets (e.g., 257 of 300), and mostly 2024-era models. — [OrcaLoca/CodexGraph search summary](https://arxiv.org/pdf/2408.03910); [RepoGraph](https://arxiv.org/html/2410.14684v2)

### Inferences
- Benefit shrinks as base models strengthen. KGCompass's relative gain is +156% for Qwen2.5-Max but +30–51% for Claude models. RepoGraph adds only about 2–3 pp. A frontier bash-only agent exceeds 74% on Verified. The durable value of maps for frontier agents is therefore **efficiency, speed, and determinism**, not raw capability.
- Maps help most on *structural* questions (hubs, callers, impact, dependency chains). Raw file reading wins when the full source text is needed. The right design is hybrid: the map returns pointers, and the agent reads source just-in-time.
- More map is not better. RepoGraph's 2-hop context hurt unless summarized, so a map must be queryable and budgeted, not dumped.

### Gaps
- No controlled 2026 study found that adds a code graph to a *frontier* agent (Claude Opus 4.x / GPT-5.x) on SWE-bench Verified/Pro and reports resolve-rate deltas.
- Moatless Tools and CodeRAG were not researched; no figures found before the search budget ran out.
- The Boris Cherny quote is secondhand; the original post was not located.

---

## 2. Do ever-longer context windows (1M+ tokens) make maps obsolete? (context engineering, context rot, long-context code benchmarks)

### Takeaway
No. Evidence from 2024–2026 shows that performance degrades as input length grows, even on trivial tasks. Focused prompts beat full prompts for every model tested, and long-context code benchmarks show steep drops. Leading agent builders (Anthropic, Manus, Cognition) now treat context as a scarce "attention budget". They favor just-in-time retrieval via lightweight references, external files and notes, and compaction. That is exactly the role a queryable map can play. Long context changes the map's job from "make the repo fit" to "route attention, cut cost, and persist state across sessions".

### Cited Findings
- **Chroma "Context Rot" technical report (Jul 14 2025; Hong, Troynikov, Huber).**
  - Scale: 18 LLMs, including Claude, GPT-4.1, Gemini 2.5, and Qwen3. 194,480 calls across 8 input lengths and 11 needle positions.
  - Performance degrades as length grows, even on a "repeated words" replication task.
  - Lower needle–question similarity accelerates the decline. A single distractor hurts; four compound the effect.
  - Shuffled haystacks beat coherent ones across all 18 models.
  - On LongMemEval (306 prompts), every model did better with focused prompts (about 300 tokens) than with full prompts (about 113k tokens). — [Chroma research](https://www.trychroma.com/research/context-rot)
  - Caveat: Chroma sells a vector database and so benefits commercially from "retrieval is needed" conclusions. — [The Decoder](https://the-decoder.com/yet-another-study-finds-that-overloading-llms-with-information-leads-to-worse-results/)
- **LongCodeBench (arXiv 2505.07897; COLM 2025).**
  - 1,043 instances from 108 repos, evaluated at 32K–1M tokens.
  - Claude 3.5 Sonnet fell from 29% to 3% on LongSWE-Bench (as context grows to 256K). Qwen2.5 fell from 70.2% to 40%.
  - Performance at long lengths cannot be inferred from short-length results. — [LongCodeBench](https://arxiv.org/abs/2505.07897v3) (snippet)
  - LoCoBench (arXiv 2509.09614) notes LongCodeBench is Python-only. — [LoCoBench](https://arxiv.org/html/2509.09614v1)
- **RepoQA (arXiv 2406.06025, Jun 2024).**
  - Task: "Searching Needle Function", i.e., finding a function in long code from a natural-language description.
  - Scale: 26 LLMs, 500 tasks, 50 repos, 5 languages.
  - Findings: the open vs. proprietary gap is small; the best model differs by language; models "may understand code better when comments are removed". — [RepoQA](https://arxiv.org/abs/2406.06025)
- **Anthropic, "Effective context engineering for AI agents" (Sep 29 2025).**
  - Defines "context rot" and an "attention budget", noting that attention creates n² pairwise relationships for n tokens.
  - Recommends "just in time" retrieval: keep lightweight references such as file paths and queries, and load data with tools at runtime.
  - Claude Code is described as a hybrid: CLAUDE.md is "dropped into context up front", while glob/grep fetch files on demand.
  - Other techniques: structured note-taking (to-do lists, NOTES.md, a memory tool), compaction, and sub-agents that return "condensed, distilled" summaries of 1,000–2,000 tokens. — [Anthropic engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- **Manus, "Context Engineering for AI Agents" (Jul 18 2025, Yichao "Peak" Ji).**
  - Workload: about 100:1 input-to-output token ratio and about 50 tool calls per task. With Claude Sonnet, cached input costs $0.30/MTok versus $3/MTok uncached (10x).
  - Lessons: use the file system as external memory; keep compression "restorable" (keep the URL, drop the page); recite goals via a continually updated todo.md so the plan stays at the end of context; keep errors in context. — [Manus blog](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)
- **Anthropic multi-agent research system (Jun 13 2025).** The lead agent saves its plan to external memory because context beyond 200,000 tokens gets truncated. — [Anthropic engineering](https://www.anthropic.com/engineering/multi-agent-research-system)
- **SWE-QA-Pro (arXiv 2603.16124, 2026).** Agentic workflows significantly outperform direct answering; for Claude Sonnet 4.5 the gap is 13 points. — [SWE-QA-Pro](https://arxiv.org/pdf/2603.16124) (snippet)

### Inferences
- Even if a repo fits into a 1M window, three costs remain: degraded accuracy, much higher cost per call (input-heavy agent loops at about 100:1), and loss of state across sessions. A compact, accurate map addresses all three.
- The consensus pattern (Anthropic, Manus) is "references in context, content on disk". A map designed as a graph of addressable references (file:line, symbol IDs, service names) fits this pattern better than a prose summary.
- Long context is still useful for one-shot ingestion of a known-relevant slice. A map helps choose that slice.

### Gaps
- No 2026 controlled evaluation found that compares (a) whole-repo-in-1M-context, (b) agentic grep, and (c) graph/map tools on the same coding tasks with current frontier models. Search budget ran out before checking for 2026 long-context coding results.
- "Context Length Alone Hurts LLM Performance Despite Perfect Retrieval" (2025) and NoLiMa were not verified directly.

---

## 3. Context-file standards (AGENTS.md, CLAUDE.md, llms.txt, Cursor rules): adoption and empirical effect

### Takeaway
AGENTS.md is now a de facto standard: 60k+ projects, 20+ supporting tools, and Linux Foundation stewardship since Dec 2025. Rigorous 2026 studies, however, find that static context files **do not reliably raise task success**. LLM-generated files slightly *lower* success and add about 20% cost. Human-written files give a small, non-significant gain and may cut runtime. Files that work tend to hold non-inferable facts (conventions, non-functional requirements), and those are under-documented in practice. This bears directly on Rassam: an LLM auto-summary of a repo, which is roughly what Rassam produces today, is the format with the weakest evidence.

### Cited Findings
**Adoption and governance**
- AGENTS.md was released by OpenAI in August 2025. It was contributed with MCP and goose to the new **Agentic AI Foundation (AAIF)** under the Linux Foundation on Dec 9 2025. — [Linux Foundation press](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation)
- Adoption counts:
  - The agents.md site says "used by over 60k open-source projects".
  - Supporting tools listed there: Codex, Jules/Gemini CLI, Cursor, GitHub Copilot coding agent, VS Code, Devin/Windsurf, Aider, goose, opencode, Zed, Warp, JetBrains Junie, Amp, Factory, RooCode, Kilo Code, Augment Code, Semgrep, and others.
  - Nested files are recommended in monorepos, with the nearest file taking precedence. OpenAI's main repo had 88 AGENTS.md files. — [agents.md](https://agents.md)
  - Earlier counts conflict: SiliconANGLE reported "over 40,000" at the AAIF launch, while ITmedia reported 60,000+. — [SiliconANGLE](https://siliconangle.com/?p=724434); [ITmedia](https://atmarkit.itmedia.co.jp/ait/spv/2512/16/news047.html)
- **"Agent READMEs" (arXiv 2511.12884, Nov 2025, rev. Aug 2026; Chatlatanagulchai, Adams, Hassan et al.).**
  - Studied 2,303 context files (AGENTS.md, CLAUDE.md, etc.) from 1,925 repos.
  - Share of files covering each topic: test procedures 75.9%, implementation details 70.8%, **architecture 68.1%**, security 14.8%, performance 14.5%.
  - Files evolve via "frequent, small additions" and are "complex, difficult-to-read artifacts". — [arXiv 2511.12884](https://arxiv.org/abs/2511.12884)

**Effect on agent outcomes**
- **ETH Zurich, Gloaguen et al., "Evaluating AGENTS.md" (arXiv 2602.11988, Feb 2026).**
  - Setup: SWE-bench Lite (300 tasks) plus CTXbench (138 instances from 12 repos with developer-written files). Agents: Claude Code with Sonnet-4.5, Codex with GPT-5.2 and GPT-5.1-mini, and Qwen Code with Qwen3-30B.
  - LLM-generated files changed success by about −0.5 pp on SWE-bench (p=0.87) and about −2 pp on CTXbench (p=0.37).
  - Developer-written files gave about +2.4 pp over none (p=0.21), and beat LLM-generated files (p=0.038).
  - Example (Sonnet-4.5 on CTXbench): none 73.2%, LLM-generated 65.2%, developer-written 70.3%.
  - Cost: +20% (SWE-bench) and +23% (CTXbench), plus about 2.45 and 3.92 extra steps. Agents follow the instructions and explore and test more.
  - Recommendations: omit LLM-generated files; limit human files to what the README doesn't cover, such as conventions and non-functional requirements; evaluate files before deploying them. — [arXiv 2602.11988 v3](https://arxiv.org/html/2602.11988v3); [ETH SRI](https://www.sri.inf.ethz.ch/publications/gloaguen2026agentsmd)
- **Lulla, Treude, Baltes et al. (arXiv 2601.20404, Jan 2026).** Across 10 repos and 124 PRs, having an AGENTS.md is *associated* with 28.64% lower median runtime and 16.58% fewer output tokens, with "comparable" completion. The results are associational and come from a small sample. — [arXiv 2601.20404](https://arxiv.org/abs/2601.20404)
- **Khatri, "Do Context Files Help Coding Agents? A Two-Agent Ablation" (arXiv 2607.27250, Jul 28 2026).**
  - Setup: Claude Code (sonnet-4-6) and Codex CLI (gpt-5.5), 3 repos, 288 runs.
  - Conditions: none, always-on AGENTS.md, and a selective on-demand topic wiki.
  - Pass rates (none / always-on / selective): Claude 53.3% / 55.6% / 55.6%; Codex 58.8% / 56.9% / 52.9%. None of the differences is significant.
  - The real AGENTS.md "never converts a near-miss to a pass". Failures reflect implementation skill, not missing repository facts.
  - The author estimates that detecting a 10 pp effect needs roughly 120–200 tasks.
  - The on-demand wiki cut Claude's cache-creation tokens (p=0.001) but did not improve correctness. Wiki size was confounded with delivery channel. — [arXiv 2607.27250](https://arxiv.org/html/2607.27250v1)
- **Anthropic, "Effective harnesses for long-running agents" (Nov 26 2025).**
  - Cross-session handoff runs through structured artifacts: `claude-progress.txt`, a JSON feature list (200+ features, each with a `passes` field, all initially failing), git history, and `init.sh`.
  - JSON was chosen because the model is "less likely to inappropriately change or overwrite JSON files" than Markdown.
  - Failure modes observed: one-shotting, declaring victory early, and marking features done without end-to-end tests. — [Anthropic engineering](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

### Inferences
- Prose context files mostly act as *instructions*: agents obey them, explore more, and spend more. They do not reliably act as *knowledge*. A map that injects a big auto-generated description up front is likely to replicate the ETH negative result.
- Structured, machine-checkable artifacts (JSON feature lists, pass/fail fields) show up in production harnesses for state and coordination. They earn their place by preventing specific failures such as premature completion and overwriting, not by raising one-shot accuracy.
- Architecture is already written into 68% of context files, by hand and in prose that is hard to read. That is a latent demand a maintained, structured map could serve.

### Gaps
- No empirical studies found on llms.txt or Cursor rules effectiveness (not searched after budget exhaustion).
- No study found that measures the staleness rate of context files versus code.

---

## 4. State of code knowledge-graph technology and MCP servers that expose code graphs

### Takeaway
Building the static layer is now commodity technology. Tree-sitter parsing (60+ languages), LSP-backed semantic tools (Serena), SCIP indexes, and embedded SQLite graphs can index a 49k-node repo in about 6 s and the Linux kernel in about 3 min, with sub-second incremental updates. Many code-graph MCP servers exist, but their benefit claims are mostly self-reported. Hyperscaler systems (Meta Glean, Google Kythe) show the "facts database" model works at scale but is heavy to adopt. The open problems are semantic and dynamic layers (intent, runtime behavior, dynamic dispatch, macros), not parsing.

### Cited Findings
- **Tree-sitter** underlies RepoGraph (AST parse, then def/ref graph) and Codebase-Memory (66 languages). — [RepoGraph](https://arxiv.org/html/2410.14684v2); [Codebase-Memory](https://arxiv.org/html/2603.27277v1)
- **Codebase-Memory engineering numbers (Mar 2026).**
  - Ships as one static C binary with a single SQLite file and 14 MCP tools.
  - Full index: about 6 s for 49K nodes; about 3 min for the Linux kernel (2.1M nodes, 4.9M edges) on an M3 Pro.
  - Incremental: a file watcher compares XXH3 content hashes, then deletes, re-parses, and recomputes affected Louvain communities, taking about 1.2 s.
  - Limitations: no macros in the tree-sitter AST, no runtime/dynamic dispatch, structure only (no source lines), and a 100k-row query ceiling. — [Codebase-Memory](https://arxiv.org/html/2603.27277v1)
- **SCIP (Sourcegraph).**
  - A language-agnostic code-indexing protocol and successor to LSIF.
  - A Meta engineer is cited as saying SCIP is "8x smaller" and processed "3x faster" than LSIF.
  - The scip-code/scip repo remains active as a producer-to-consumer transmission format. — [Sourcegraph SCIP announcement](https://sourcegraph.com/blog/announcing-scip) (snippet)
- **Stack graphs (GitHub)** power GitHub's Precise Code Navigation, per the stack-graphs paper. A third-party project (Grafy) dropped them after finding the published tree-sitter-stack-graphs language packs failing in production. — [stack graphs paper](https://www.arxiv.org/pdf/2211.01224); [Grafy](https://github.com/daneuchar/Grafy) (snippet)
- **Glean and Kythe.** Meta's Glean collects, derives, and queries facts about code at scale; consumers must build their own schemas. Google's Kythe uses a language-agnostic graph schema but needs a per-language indexer. — [third-party comparison](https://aaronsb.github.io/knowledge-graph-system/research/code-intelligence-platforms-comparison) (snippet; third-party)
- **Serena (oraios/serena).**
  - An MCP server or toolkit that provides "semantic retrieval and editing" backed by LSP language servers, with Claude Code and Claude Desktop integrations.
  - Sponsored by the VS Code team, Microsoft OSPO, and GitHub Open Source. — [Serena GitHub](https://github.com/oraios/serena) (snippet)
  - Reported at about 22,625 stars and 1,512 forks as of 2026-04-08. — [third-party reference](https://pantheon-org.github.io/agentic-context/references/oraios-serena/) (snippet)
- **Other code-graph MCPs.**
  - Bikach/codeGraph uses Neo4j. — [GitHub](https://github.com/Bikach/codeGraph)
  - cgraphy adds git co-change history as graph edges alongside calls, imports, and inheritance. — [PyPI](https://pypi.org/project/cgraphy/)
  - LeanKG is written in Rust. — [docs.rs](https://docs.rs/crate/leankg/0.12.3)
  - Each project's benefit claims are self-reported (see Q1).
- **CGM (May 2025)** shows a different route: putting the code graph into the model's attention instead of exposing it as a tool. — [CGM](https://arxiv.org/abs/2505.16901)
- **DeepWiki (Cognition).**
  - The blog post (byline May 5 2025) describes it as "the free public version of Devin Wiki and Devin Search", covering "over 50,000 of the top public GitHub repos".
  - No accuracy evaluation is published on that page. — [Cognition DeepWiki post](https://cognition.com/blog/deepwiki)
- Cursor indexes codebases with embeddings, and in 2026 it described secure indexing that re-cites the 12.5% accuracy gain. — [Cursor secure indexing](https://cursor.com/blog/secure-codebase-indexing) (snippet)

### Inferences
- Rassam should not build a parser or indexer from scratch. Tree-sitter, LSP/Serena, and SCIP can supply a deterministic base graph. Rassam's differentiation has to sit above that layer: semantic grouping, intent, decisions, runtime, and human curation.
- The market already has many code-graph MCPs and wikis (DeepWiki, Devin Wiki, Serena, Codebase-Memory). A pure "static code graph exposed via MCP" would not be distinctive.

### Gaps
- GraphRAG/LightRAG applied to code, CodeQL, and Joern code property graphs were not researched (search budget exhausted).
- No reliable adoption or download numbers found for code-graph MCP servers beyond Serena's star count.
- The archive status of github/stack-graphs is unconfirmed.

---

## 5. Runtime/dynamic architecture: traces to service maps, eBPF discovery, drift detection, fitness functions

### Takeaway
Runtime topology is a solved, standardized data source. The OpenTelemetry Collector's service-graph connector, Tempo and Alloy, and Datadog's Service Map all build dependency graphs automatically from traces. eBPF-based OpenTelemetry instrumentation (OBI, formerly Grafana Beyla) reached v1.0 in 2026 and provides zero-code telemetry. Architecture rules as executable tests (ArchUnit) are mature. What is missing is joining these: a declared/intended architecture diffed against observed runtime and static structure, in a form agents can query. No product evidence for that join was found in this research.

### Cited Findings
- **OpenTelemetry Collector `servicegraph` connector.**
  - Pairs client↔server and producer↔consumer spans into edges. Database calls are client spans carrying a db attribute.
  - Emits `traces_service_graph_request_total`, `traces_service_graph_request_failed_total`, client/server latency histograms, and unpaired/dropped span counters.
  - Creates "virtual nodes" for uninstrumented peers from attributes such as `peer.service` and `db.*`.
  - It is stateful: all spans of a request must reach the same collector, so load-balancing is needed.
  - Stability: alpha. The component was renamed `service_graph`. — [OTel collector-contrib README](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/connector/servicegraphconnector/README.md)
- **Grafana Tempo** generates service graphs through the metrics-generator or Alloy's `otelcol.connector.servicegraph`. The docs warn about cardinality with many services. — [Grafana Tempo docs](https://grafana.com/docs/tempo/latest/metrics-generator/service_graphs/)
- **Datadog Service Map.**
  - Built automatically from APM traces. Nodes are services matching the Catalog; edges are aggregate observed calls.
  - New services and connections appear "within moments" of instrumentation, and nodes with no traces for 30 days age out.
  - It needs complete traces with root spans. Time-range scoping lets users track evolution, but no dedicated change-detection feature is described. — [Datadog docs](https://docs.datadoghq.com/tracing/services/services_map/)
- **eBPF (Beyla → OBI).**
  - Grafana Labs donated Beyla to OpenTelemetry as "OpenTelemetry eBPF Instrumentation" (OBI), announced May 7 2025. — [Grafana blog](https://grafana.com/blog/2025/05/07/opentelemetry-ebpf-instrumentation-beyla-donation/); [Beyla vs OBI docs](https://grafana.com/docs/beyla/latest/obi/)
  - OBI v1.0.0 shipped in 2026: zero-code eBPF metrics and traces on Linux, with runtime metrics for Go, Java, .NET, Node.js, and Python (experimental).
  - Added protocols include MQTT, NATS, AMQP 1.0, MSSQL, Couchbase, Memcached, and Aerospike. It covers LLM-provider and **MCP interactions** and claims to capture "service dependencies". — [OpenTelemetry blog](https://opentelemetry.io/blog/2026/obi-v1-release/)
- **ArchUnit.**
  - Checks Java architecture (package/class dependencies, layers, slices, cycles) by analyzing bytecode, and runs as ordinary unit tests. A .NET port exists.
  - The latest news item is v1.5.0 (Aug 4 2026). — [ArchUnit](https://www.archunit.org/)

### Inferences
- A Rassam "runtime layer" could ingest standard OTel service-graph metrics (with known metric names and labels) or OBI output without custom agents. That is a low-cost path to an observed-architecture overlay.
- Drift detection needs a declared model to diff against. Observability vendors render *observed* topology; ArchUnit-style tools encode *intended* constraints but only for code, in one language. A tool that holds intended, static, and observed topology together and exposes the diff to agents fills a gap that is visible in these sources.
- Executable fitness functions give agents a verification oracle, which matters given that MAST attributes about 23.5% of failures to verification (Q7).

### Gaps
- Honeycomb's service map, LLM-based architecture drift detection, and "architecture as code" tools (Structurizr/C4, Backstage catalog) were not researched (search budget exhausted).
- No source found on eBPF-only topology discovery accuracy versus SDK tracing.

---

## 6. Benchmarks of codebase understanding and architecture recovery by LLMs

### Takeaway
Repository QA benchmarks exist (SWE-QA, SWE-QA-Pro, RepoQA, LongCodeBench, Codebase-Memory's structural QA) and consistently show that retrieval or agentic exploration beats direct or long-context answering. **No widely adopted benchmark for architecture-map correctness exists.** Architecture-recovery papers (ArchAgent 2026, ECSA 2025, ESEM 2026) report that LLMs are promising but "insufficient for fully reliable reverse engineering". DeepWiki-style generated wikis have no published accuracy evaluation that was found.

### Cited Findings
- **SWE-QA (arXiv 2509.14635; ACL Findings 2026).**
  - Size: 576 QA pairs from 12 repos in v1, expanded to 720 pairs from 15 Python repos (SWE-bench and SWE-bench-Live).
  - Findings: direct prompting performs poorly; RAG improves significantly; the authors' SWE-QA-Agent got the highest human ratings.
  - Answers are scored by an LLM judge with human spot-checks. — [SWE-QA v2](https://arxiv.org/html/2509.14635v2); [ACL Anthology](https://aclanthology.org/2026.findings-acl.402/) (snippet)
- **SWE-QA-Pro (arXiv 2603.16124, 2026)** uses long-tail repos to reduce memorization. Agentic workflows beat direct answering by 13 points for Claude Sonnet 4.5. — [SWE-QA-Pro](https://arxiv.org/pdf/2603.16124) (snippet)
- **RepoQA (Jun 2024)**: 26 LLMs, 500 needle-function tasks, 5 languages. — [RepoQA](https://arxiv.org/abs/2406.06025)
- **LongCodeBench (2025)**: 1,043 instances, 32K–1M tokens, steep degradation with length. — [LongCodeBench](https://arxiv.org/abs/2505.07897v3)
- **Codebase-Memory structural benchmark (Mar 2026)**: 12 categories (hub detection, caller ranking, call-chain tracing, code retrieval), 31 languages, one repo each, single-author grading. — [Codebase-Memory](https://arxiv.org/html/2603.27277v1)
- **Cursor Context Bench**: internal and unpublished; supports Cursor's 12.5% semantic-search claim. — [Cursor blog](https://cursor.com/blog/semsearch) (snippet)
- **ArchAgent (arXiv 2601.13007, Jan 2026; ICASSP 2026).**
  - Combines static analysis, adaptive code segmentation, and LLM synthesis to produce Mermaid multi-view, business-aligned architecture diagrams across repositories.
  - Ablation: "dependency context improves the accuracy of generated architectures".
  - No numbers appear in the abstract; the benchmark is at github.com/panrusheng/arch-eval-benchmark. — [ArchAgent](https://arxiv.org/abs/2601.13007)
- **ECSA 2025, "Automated Software Architecture Design Recovery from Source Code Using LLMs"**, evaluates off-the-shelf LLMs, analyzes their error types, and tests self-reflection. Results were not retrieved. — [ECSA 2025 listing](https://conf.researchr.org/details/ecsa-2025/ecsa-2025-call-for-research-papers/7/Automated-Software-Architecture-Design-Recovery-from-Source-Code-Using-LLMs)
- **ESEM 2026 vision paper (microservices)**: LLMs "show promise for automated architecture recovery, but current capabilities remain insufficient for fully reliable reverse engineering". — [ESEM 2026 / LIPIcs](https://drops.dagstuhl.de/storage/00lipics/lipics-vol394-esem2026/LIPIcs.ESEM.2026.62/LIPIcs.ESEM.2026.62.pdf) (snippet)
- **DeepWiki**: covers 50,000+ repos, with no accuracy evaluation published in its launch post. — [Cognition](https://cognition.com/blog/deepwiki)

### Inferences
- The finding that dependency context improves LLM architecture recovery (ArchAgent ablation, RepoGraph, LocAgent) supports a pipeline that builds a deterministic graph first and adds LLM interpretation second, the reverse of having an LLM read a file tree and guess the architecture.
- The lack of an architecture-map accuracy benchmark is both a risk (Rassam can't easily prove its map is correct) and an opportunity: publishing one could build credibility.

### Gaps
- Per-model SWE-QA scores, ArchAgent metrics, and the ECSA 2025 results were not retrieved.
- A study cited in arXiv 2608.28403 (Taglia-ferro et al., benchmarking LLM PlantUML component diagrams against ground truth) was seen only as a citation.
- CodeQueries was not researched.

---

## 7. Multi-agent coordination: failure taxonomies, blackboards, shared state, and the role of shared structured representations

### Takeaway
Multi-agent LLM systems fail mostly on **system design/specification (~44%)**, **inter-agent misalignment (~32%)**, and **verification (~24%)**, per MAST. Practitioners (Cognition, Anthropic) identify the cause as context fragmentation and conflicting implicit decisions. They recommend shared full context or external artifacts passed by reference. Blackboard-style shared state shows 13–57% relative gains in one 2025 data-discovery study. MAST warns, however, that better context and protocols alone are "often insufficient" for misalignment, and naive shared memory brings clutter and write contention. Shared structured representations help most against specific failure modes: lost history, resets, information withholding, unclear termination, and missing verification. They help less against reasoning-action mismatch.

### Cited Findings
- **MAST, "Why Do Multi-Agent LLM Systems Fail?" (Cemri et al., UC Berkeley; arXiv 2503.13657; NeurIPS 2025).**
  - Scale: 1,642 annotated traces from 7 frameworks (MetaGPT, ChatDev, HyperAgent, AppWorld, AG2, Magentic-One, OpenManus). 14 failure modes; human κ=0.88; an LLM annotator reaches κ=0.77 against humans.
  - Mode prevalence: step repetition 15.7%, reasoning-action mismatch 13.2%, unaware of termination conditions 12.4%, disobey task spec 11.8%, incorrect verification 9.1%, no/incomplete verification 8.2%, task derailment 7.4%, fail to ask for clarification 6.8%, premature termination 6.2%, loss of conversation history 2.8%, conversation reset 2.2%, ignored other agent's input 1.9%, disobey role spec 1.5%, information withholding 0.85%.
  - Category totals (summed from the modes): FC1 system design ~44.2%, FC2 inter-agent misalignment ~32.4%, FC3 verification ~23.5%.
  - ChatDev reaches only 33.33% correctness on ProgramDev.
  - Interventions on ChatDev: better role specs plus giving the CEO the final say gave +9.4%; a high-level objective verification step gave +15.6% (the largest gain).
  - The authors note that MCP/A2A standardize message formats but FC2 errors persist. "Solutions focused on context or communication protocols are often insufficient for FC2 failures." Memory and state management are listed as an open direction, not a tested remedy. — [MAST arXiv v3](https://arxiv.org/html/2503.13657v3); [NeurIPS 2025 poster](https://neurips.cc/virtual/2025/poster/121528)
- **Anthropic multi-agent research system (Jun 13 2025).**
  - An Opus 4 lead with Sonnet 4 subagents beat single-agent Opus 4 by 90.2% on an internal research eval.
  - Token use: agents use about 4x the tokens of chat, multi-agent systems about 15x. Token usage explained 80% of performance variance on BrowseComp.
  - Vague delegation caused duplicated work, so subagents need an objective, output format, tool guidance, and boundaries.
  - Subagents should "store outputs in external systems and pass lightweight references" to avoid a "game of telephone".
  - Synchronous execution is a bottleneck. Coding has fewer parallelizable subtasks, and domains needing shared context or many dependencies are poor fits. — [Anthropic engineering](https://www.anthropic.com/engineering/multi-agent-research-system)
- **Cognition, "Don't Build Multi-Agents" (Jun 12 2025, Walden Yan).**
  - Principles: (1) "Share context, and share full agent traces, not just individual messages"; (2) "Actions carry implicit decisions, and conflicting decisions carry bad results".
  - Example: a Flappy Bird clone where subagents built a Mario-style background and a mismatched bird.
  - Recommendation: a single-threaded linear agent, plus a context-compression model for long tasks. — [Cognition blog](https://cognition.com/blog/dont-build-multi-agents)
- **Blackboard architectures.**
  - Salemi et al. (arXiv 2510.01285, Sep 2025, v2 Jan 2026): a central agent posts requests to a blackboard and subordinate agents volunteer. Over the best baseline (including RAG and master-slave multi-agent setups) it gained 13%–57% relative end-to-end success and up to 9% relative data-discovery F1. — [arXiv 2510.01285](https://arxiv.org/abs/2510.01285v2) (snippet)
  - arXiv 2507.01701 (Jul 2025): agents see all shared information on the blackboard, and an LLM control unit selects which agent acts until consensus. It is "competitive with the SOTA static and dynamic MASs", has the best average performance among those compared, and uses fewer tokens (no numbers in abstract). — [arXiv 2507.01701](https://arxiv.org/abs/2507.01701)
  - A late-2025 memory survey warns that naive global sharing creates "memory clutter, write contention, and the lack of role- or permission-aware access control". — [Memory in the Age of AI Agents, arXiv 2512.13564](https://arxiv.org/pdf/2512.13564) (snippet)
- **SWE-Debate (arXiv 2507.23348, Jul 2025)** uses a shared code dependency graph as the coordination substrate. It traverses the graph to create fault-propagation traces; specialized agents debate along those traces for three rounds to reach a consolidated fix plan; an MCTS agent then patches. It claims SOTA among open-source frameworks (numbers not retrieved). — [SWE-Debate](https://arxiv.org/abs/2507.23348)
- **Anthropic long-running harness (Nov 26 2025).**
  - Multi-session continuity relies on structured shared artifacts (progress log, JSON feature list, git).
  - The authors say it is "still unclear" whether a single general agent or a multi-agent architecture (testing, QA, or cleanup agents) is better. — [Anthropic engineering](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

### Inferences
- Mapping MAST modes to what a shared structured map could address:
  - Loss of history (2.8%) and conversation reset (2.2%): persistent shared state.
  - Information withholding (0.85%) and ignored input (1.9%): a shared blackboard.
  - Unaware of termination (12.4%) and premature termination (6.2%): explicit acceptance criteria and pass/fail fields, as in Anthropic's feature list.
  - Verification failures (17.3% combined): executable invariants and fitness functions attached to map nodes.
  - Step repetition (15.7%): a shared log of completed work per node.
  - Together these modes cover a meaningful share of observed failures. Reasoning-action mismatch (13.2%) and derailment are unlikely to be fixed by a map.
- Cognition's "implicit decisions" point implies a coordination map needs a **decision log** (who decided what, why, and which nodes it constrains), not just a dependency graph. Two agents editing different nodes conflict through unstated assumptions, not through files.
- Anthropic's "pass lightweight references" matches a graph with stable IDs: agents write results to nodes and pass node IDs.
- The memory survey's warnings mean a shared map needs write discipline: typed/structured records, provenance, permissions, and conflict handling. A free-form shared doc is not enough.

### Gaps
- No controlled study found that measures multi-agent *coding* success with versus without a shared architecture graph or blackboard.
- MAST's full intervention appendix was truncated; topology-change results were not seen.
- Real-world fleet setups (parallel Claude Code/Codex agents in worktrees) and their conflict rates were not researched.

---

## 8. What would a map need to contain to be useful to agents, and how can it be kept in sync?

### Takeaway
The evidence points to a layered, queryable, provenance-tracked map rather than a prose document:
- **Deterministic structure** (symbols, calls, imports, dependencies) from parsers, kept fresh incrementally.
- **Observed runtime topology** from OTel traces.
- **Human-authored non-inferable knowledge**: intent, invariants, conventions, security/performance requirements, decisions, ownership. This is what context files under-document and what ETH says actually helps.
- **Coordination state**: task claims, progress, pass/fail, decision log, in machine-checkable formats.

Sync must be automatic for derived layers (hash-based reindex, trace ingestion) and verified for human and LLM layers (staleness flags, executable checks).

### Cited Findings
- **What helps:**
  - Developer-written files beat LLM-generated ones (p=0.038). Guidance is to include only non-inferable info such as conventions and non-functional requirements. — [ETH arXiv 2602.11988](https://arxiv.org/html/2602.11988v3)
  - Security (14.8%) and performance (14.5%) are rarely documented, while architecture (68.1%) is common but hard to read. — [Agent READMEs](https://arxiv.org/abs/2511.12884)
- **Compactness and budget:**
  - Aider defaults to a 1k-token ranked map. — [Aider](https://aider.chat/docs/repomap.html)
  - RepoGraph 1-hop beat 2-hop. — [RepoGraph](https://arxiv.org/html/2410.14684v2)
  - Sub-agent summaries run 1–2k tokens. — [Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- **References over content:**
  - "Lightweight references" and just-in-time loading. — [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
  - "Restorable" compression. — [Manus](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)
  - Outputs passed by reference to avoid a "game of telephone". — [Anthropic multi-agent](https://www.anthropic.com/engineering/multi-agent-research-system)
- **Structured formats resist corruption:** JSON is less likely to be overwritten than Markdown, and agents are told to change only the `passes` field. — [Anthropic harness](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- **Static graph limits:** no macros, no dynamic dispatch or runtime behavior, structure without source. — [Codebase-Memory](https://arxiv.org/html/2603.27277v1)
- **Runtime layer exists as a standard:** OTel service-graph metrics with virtual nodes for databases and uninstrumented peers. — [OTel servicegraph README](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/connector/servicegraphconnector/README.md)
  - Datadog derives dependencies from actual traffic and ages nodes out after 30 days with no traces. — [Datadog](https://docs.datadoghq.com/tracing/services/services_map/)
- **Executable constraints:** ArchUnit checks layering, dependencies, and cycles as unit tests. — [ArchUnit](https://www.archunit.org/)
  - The single most effective MAST intervention was adding verification (+15.6%). — [MAST](https://arxiv.org/html/2503.13657v3)
- **Sync mechanisms:**
  - Content-hash incremental reindex in about 1.2 s. — [Codebase-Memory](https://arxiv.org/html/2603.27277v1)
  - Stale indexes were a reason the Claude Code team dropped RAG. — [Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/building-claude-code-with-boris-cherny) (secondary)
  - Context files evolve through "frequent, small additions", i.e., accretion, not curation. — [Agent READMEs](https://arxiv.org/abs/2511.12884)
- **Git co-change as a signal:** cgraphy adds co-change history as graph edges. — [cgraphy](https://pypi.org/project/cgraphy/)

### Inferences
- Candidate map schema per node or edge: stable ID; kind (module, service, data store, external API); code anchors (paths, symbols); static dependencies; observed runtime edges with recency; interface/contract; owner; intent (1–2 lines); invariants as executable rules; linked ADRs/decisions; non-functional requirements; provenance (parser / trace / LLM / human) with timestamp and confidence; coordination fields (claimed-by, status, acceptance criteria).
- Staleness is the main enemy. Derived layers must regenerate automatically; LLM and human layers need "verified-at commit X" stamps and automatic invalidation when anchored code changes.
- The map should be consumed through queries (MCP tools returning small, referenced answers), not injected wholesale. Any always-on summary should be tiny and human-curated, given the ETH and Khatri results.

### Gaps
- No empirical study found comparing *which fields* of an architecture map most improve agent outcomes. This would need an ablation Rassam could run itself.
- No source found on ADR usage by agents or on the measured value of ownership metadata for agents.

---

## Implications for Rassam

- **Reposition from "AI-drawn flowchart" to "verified, queryable system model that humans and agents both read and write".** The evidence (ETH 2026, Khatri 2026) says an LLM-generated description of a repo, which is roughly Rassam's current output, does not raise agent success and adds about 20% cost. Value must come from (a) deterministic structure, (b) non-inferable human knowledge, (c) runtime truth, and (d) coordination state, not from another summary.
- **Build the base graph deterministically, then layer LLM interpretation on top with provenance.** Use tree-sitter, LSP/Serena, or SCIP for symbols, calls, and imports, with hash-based incremental reindexing (about 1 s updates are achievable per Codebase-Memory). Let the LLM propose module groupings and intent, but label every fact by source (parser / trace / LLM / human), timestamp, and commit, and mark LLM facts "unverified" until a human confirms them. The current dagre flowchart becomes one *view* of this model.
- **Ship an MCP server as the primary agent interface, returning small answers with references.** Example tools: `get_component(id)`, `callers/callees`, `impact(change)`, `owners`, `invariants(id)`, `decisions(id)`, `runtime_edges(service)`. Answers should be file:line or node-ID pointers that agents expand just-in-time, matching the Anthropic/Manus guidance. Expect the main measurable win to be roughly 2–10x fewer tokens and tool calls (Codebase-Memory, Cursor), not large success-rate jumps on frontier models.
- **Add a runtime overlay from OpenTelemetry.** Ingest `traces_service_graph_*` metrics or OBI/eBPF output, and diff observed edges against declared ones to produce drift alerts. This "intended vs. static vs. observed" join is the gap in today's tools: observability vendors show only observed topology, and ArchUnit only intended code rules.
- **Make invariants executable and attach them to map nodes.** Examples: ArchUnit-style dependency and layering rules, contract checks, and acceptance criteria with `passes` fields in JSON. These give agents verification and termination oracles, which address MAST's verification and termination failures (~30% of observed failures) and its best intervention (+15.6% from adding verification).
- **Treat the map as a typed blackboard for agent fleets.** Include per-node task claims and locks, a progress log, and a decision log (ADRs: who, what, why, and which nodes it constrains) to counter Cognition's "conflicting implicit decisions". Use structured JSON writes with permissions and conflict detection, not free-form prose, given the memory-survey warnings about clutter and write contention. Fix the current gap where agent `write` events don't update the synced snapshot: every write should be a versioned, attributed change to the shared model.
- **Prove it with your own eval, because none exists for architecture maps.** Run with/without-Rassam-MCP ablations on about 120–200 tasks (Khatri's power estimate), measuring success, tokens, tool calls, and wall-clock time. Also build or publish a small architecture-map-correctness benchmark (ArchAgent's arch-eval-benchmark is a starting point). Published numbers would set Rassam apart from DeepWiki, Serena, and graph-MCP projects whose claims are self-reported.
- **Interoperate rather than compete with standards.** Emit a small, human-curated AGENTS.md section generated from verified map facts (non-inferable items only), read existing AGENTS.md/CLAUDE.md as input, and consider an open JSON schema for the system model. That keeps Rassam useful as "infrastructure" even as individual agents become more capable at raw exploration.
