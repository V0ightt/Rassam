# Code-Understanding and Software-Visualization Tools: Competitive Landscape (Nov 2026) and Research History

Research date: 2026-11-19. Method: web search and fetch of product pages, changelogs, funding news and academic papers. The shared web-search budget ran out partway through, so later items were checked only by fetching known URLs. The Gaps sections list what is still unverified. Traction numbers marked "(vendor claim)" or "(unverified)" should not be treated as facts.

---

## 1. Direct and adjacent competitors: what they do, pricing, traction, funding, fate (as of Nov 2026)

### Takeaway
Since mid-2025, the "paste a repo, get an AI architecture map or wiki" category has been absorbed by well-funded incumbents that give it away free: Cognition DeepWiki and Codemaps, Google Code Wiki, GitHub Copilot Spaces, and a crowd of open-source tools and agent skills (GitDiagram, deepwiki-open, Repomix, Gitingest, Archify). The independent companies that survived did so by pivoting away from "understanding/visualization as the product":
- Greptile moved to code review.
- Swimm moved to legacy-modernization services.
- Sourcegraph split, with Amp leaving to build agents.
- CodeSee shut down and was absorbed into GitKraken.
- Augment repackaged its index as an MCP "Context Engine" for other agents.

Almost every player now exposes its understanding artifact to AI agents through MCP, not only to humans.

### Cited Findings

**A. AI-native code wikis and maps (the closest substitutes for Rassam)**

- **Cognition DeepWiki**
  - Launched 2025-05-05. Swapping "github.com" for "deepwiki.com" in a repo URL gives an AI wiki. At launch it had indexed 50,000+ top public repos. It is free for public repos; private repos need a Devin account. It is described as "the free public version of Devin Wiki and Devin Search." The rationale: "It shouldn't take hours to get up to speed on a new codebase." — [Cognition blog, 2025-05-05](https://cognition.com/blog/deepwiki)
  - Later traction: 1.4 million repositories indexed and over 20 million queries served. This comes from an undated (listed as 2026) ZenML LLMOps case-study writeup of a Cognition talk, not a Cognition primary source, so it is **unverified**. — [ZenML LLMOps DB](https://www.zenml.io/llmops-database/auto-generated-codebase-documentation-and-intelligence-at-scale)
  - Architecture, per the same writeup:
    - Files and links are scored using directory structure, symbol graphs, git history and runtime data.
    - The graph is clustered into "major systems."
    - The table of contents and glossary are generated first, then pages are written in parallel with citations to code.
    - v2 moved from an orchestrated pipeline to an "agentic core" that can pull in more clusters. — [ZenML](https://www.zenml.io/llmops-database/auto-generated-codebase-documentation-and-intelligence-at-scale)
  - Quality complaints: an OpenWrt package maintainer warned that DeepWiki "frequently" produces hallucinations and factual errors (for example, wrong config options and command behavior) that are presented confidently as authoritative. — [OpenWrt forum](https://forum.openwrt.org/t/important-consideration-deepwiki-ai-generated-docs-may-contain-inaccuracies/249471)
- **Windsurf Codemaps (Cognition)**
  - Launched 2025-11-04. Codemaps are "AI-annotated, structured maps of your codebase" generated **for a task or question the user enters**. Nodes jump to the exact code, and a visual map view is available. Codemaps can be referenced in agent prompts (`@{codemap}`) as context.
  - Models: "Fast" uses SWE-1.5 and "Smart" uses Claude Sonnet 4.5. Each map is a snapshot and respects zero data retention.
  - Available in Windsurf and DeepWiki. Pricing is not stated.
  - Rationale quotes: "people get into trouble when the code they generate and maintain starts to outstrip their ability to understand it", and "To understand is to be accountable."
  - Cognition admits it "has not yet benchmarked" how much Codemaps improves agents.
  - Future direction: an open ".codemap protocol" usable by other agents and tools. This is not shipped. — [Cognition blog, 2025-11-04](https://cognition.com/blog/codemaps); [CodeZine](https://codezine.jp/news/detail/22517)
  - The blog cites third-party figures: new engineers take 3–9 months to ramp, and senior engineers lose 5+ hours a week onboarding others. — [Cognition blog](https://cognition.com/blog/codemaps)
- **Context: Cognition owns Windsurf.** The acquisition was announced 2025-07-14. At that time Windsurf had $82M ARR, 350+ enterprise customers and "hundreds of thousands" of daily active users. — [Cognition blog, 2025-07-14](https://cognition.com/blog/windsurf). Some secondary sources give conflicting dates and prices for the deal (for example a "$250M" figure), so treat those as unverified. — [NxCode](https://www.nxcode.io/pt/resources/news/cognition-windsurf-acquisition-swe-1-5-codemaps-2026)
- **Google Code Wiki (codewiki.google)**
  - Public preview since 2025-11-13. Google says it:
    - rescans the full codebase and "regenerates the documentation after each change";
    - auto-generates **architecture, class and sequence diagrams** that "reflect the current code";
    - hyperlinks sections to code;
    - adds a Gemini-powered chat agent grounded in the wiki.
  - Public repos only for now. A Gemini CLI extension for private repos was announced as "coming soon" with a waitlist. No pricing was announced.
  - Google's claim: "Reading existing code is one of the biggest, most expensive bottlenecks in software development." — [Google Developers Blog, 2025-11-13](https://developers.googleblog.com/introducing-code-wiki-accelerating-your-code-understanding/)
- **CodeWiki (academic and open source; not related to Google's product of the same name)**
  - Hoang, Le-Anh, Le and Bui. arXiv v1 2025-10-28, v6 2026-04-04, accepted at ACL 2026.
  - Method: hierarchical decomposition plus recursive multi-agent processing, producing text, architecture diagrams and data-flow views across 7 languages.
  - Results on the authors' own CodeWikiBench (rubrics derived from official docs, judged by an LLM): CodeWiki 68.79% vs **DeepWiki 64.06%**.
  - Caveat: the authors built the benchmark, and these scores measure quality, not hallucination counts. — [arXiv 2510.24428](https://arxiv.org/abs/2510.24428)
- **Open-source DeepWiki clones**
  - deepwiki-open (AsyncFuncAI): MIT licensed, self-hosted, ~12,900+ stars.
  - OpenDeepWiki (AIDotNet, .NET 9 and Semantic Kernel): ~2,500+ stars.
  - Star counts come from a third-party page and are **unverified**. — [overview page](https://quochuydev.github.io/tech-research/researching/deepwiki-overview.html)
  - One-click deploy templates exist on Railway, Hostinger and similar hosts. — [Railway](https://railway.com/deploy/deepwiki-open)

**B. Repo-to-diagram and architecture-diagram tools**

- **GitDiagram (Ahmed Khaleel)**
  - Live repo page, fetched Nov 2026: 19.0k stars, 1.5k forks, MIT licensed, 814 commits.
  - Swapping "hub" for "diagram" in a GitHub URL gives an AI-generated, interactive Mermaid architecture diagram with a streamed explanation, exportable as PNG or Mermaid source. It works for public repos, and for private repos with a token.
  - Newer additions: a keyless remote MCP server at gitdiagram.com/mcp, and ~1-minute AI "explainer videos" (early access).
  - Business model: free, funded by a Sponsor button, Ko-fi and an "Ad space" banner. — [GitHub repo](https://github.com/ahmedkhaleel2004/gitdiagram)
  - Star history: 15.7k on 2026-06-12. — [Star History](https://www.star-history.com/ahmedkhaleel2004/gitdiagram/). It reached #1 on GitHub Trending in 2025. — [Trendshift](https://trendshift.io/repositories/13277)
  - **This is the closest open-source analogue to Rassam's core feature, and it is free.**
- **CodeViz (YC S24, EdisonLabs Inc.)**
  - A VS Code extension (Launch HN August 2024; Product Hunt 2024-09-10). It offers call graphs plus top-level architecture diagrams, filtered to the developer's task. — [HN launch summary](https://bestofai.com/article/launch-hn-codeviz-yc-s24-visual-maps-of-your-codebase-in-vs-code); [Product Hunt](https://www.producthunt.com/posts/codeviz-yc-s24)
  - Basic features are free; detailed architecture diagrams are paid. — [YC launch](https://www.ycombinator.com/launches/LcZ-codeviz-visual-map-gps-for-your-codebase)
  - Current site: "Code architecture in one clear view". It uses C4 and UML standards, keeps diagrams linked to source, and lets teams branch a shared architecture model and store versions in Git. Integrations: VS Code, GitHub, Jira, Slack and Figma.
  - Vendor claims: "70k+ developers" and "40x ROI", with logos including OpenAI and Anthropic. These are **vendor claims**.
  - The footer says © 2025, and no MCP or agent integration is mentioned. — [codeviz.ai](https://www.codeviz.ai/)
- **Eraser.io (DiagramGPT, Eraserbot)**
  - Pricing per member, fetched Nov 2026:
    - Free: 3 files and 3 AI credits.
    - Business: $45/month annual or $60 monthly, 100 AI credits a month, 1 Git repo.
    - Business Plus: listed at $42/month annual with a 10-seat minimum, 250 credits and 3 repos. This listed price looks anomalous.
    - Enterprise: custom.
  - The product menu lists **"Eraserbot — Codebase diagrams that update themselves"**, plus MCP and agent integrations and a diagramming API. — [Eraser pricing](https://www.eraser.io/pricing)
  - DiagramGPT, a free "AI sidecar", reportedly drove ~30% of all Eraser sign-ups. — [Growth Unhinged (Kyle Poyar)](https://www.growthunhinged.com/p/how-an-ai-sidecar-product-drove-30?open=false)
  - Funding is small and estimates disagree (~$4M seed from Caffeinated Capital and others). **Unverified**. — [CB Insights](https://www.cbinsights.com/company/eraser/)
- **IcePanel (C4 modelling, YC)**
  - Pricing, fetched Nov 2026:
    - Free: 1 editor and 100 model objects.
    - Growth: $40 per editor/month.
    - Scale: $80 per editor/month, 20+ editors.
    - Enterprise: 50+ editors.
    - A $10k training program add-on.
  - AI features: AI-generated descriptions and summaries. It also offers an **MCP server with read and write access for LLMs**, a REST API and webhooks.
  - No GitHub sync or drift detection is mentioned. Customer logos include Cisco, BMW, Alphabet and the University of Cambridge. — [IcePanel pricing](https://icepanel.io/pricing)
  - Only one confirmed funding instrument: a $0.5M YC convertible note (2023). — [CB Insights](https://www.cbinsights.com/company/icepanel/financials)
- **Structurizr / C4 model (Simon Brown)**
  - The "models as code" reference implementation of C4. It deliberately has no drag-and-drop UI. — [Structurizr docs](https://docs.structurizr.com/as-code)
  - It now pitches itself as the best target for **AI-generated** C4: an MCP server for DSL validation, parsing and inspection, plus "inspections" that flag missing descriptions.
  - Its argument: Mermaid, PlantUML and D2 "don't understand the C4 model and don't respect its rules", whereas a single model with many views stays consistent.
  - Binaries are labelled v2026.09.19, so it is actively maintained. — [Structurizr AI page](https://docs.structurizr.com/ai)
- **Mermaid (formerly Mermaid Chart; now branded "Mermaid" at mermaid.ai)**
  - Pricing: Free (3 diagrams, 15 AI credits); Plus $10/user/month; Premium $20/user/month; Enterprise custom. AI is included in all plans. — [mermaid.ai pricing](https://mermaid.ai/pricing)
  - Funding: a $7.5M seed in 2024 per Open Core Ventures. TechCrunch reported $5.5M in March 2024 (conflict). — [OCV](https://opencoreventures.com/insights/mermaid-chart-from-open-source-project-to-raising-a-7-5m-seed-round); [TechCrunch](https://techcrunch.com/2024/03/20/mermaid-chart-a-markdown-like-tool-for-creating-diagrams-raises-5-5m/amp)
  - The open-source mermaid.js has ~85k stars (2026) — [Taskade history](https://www.taskade.com/blog/history-of-mermaid.md). It is the de facto output format of LLM diagram tools (GitDiagram, Claude Code and Cursor skills; see D).

**C. Code-understanding platforms, and what happened to them**

- **CodeSee (code-visualization startup, "maps" of codebases)**
  - In July 2023 it added generative AI for natural-language codebase queries. — [TechCrunch, 2023-07-19](https://techcrunch.com/2023/07/19/codesee-adds-generative-ai-to-explore-code-base-with-natural-language-queries/amp)
  - A LinkedIn post by an employee says CodeSee would be "closing its doors and shutting down commercial operations on Thursday, Feb 22nd". That date is consistent with 2024. — [LinkedIn post](https://sk.linkedin.com/in/daniel-ivanyi-16845458)
  - GitKraken then announced on **2024-05-14** that it had acquired CodeSee (terms undisclosed). Its "code insights" were to be folded into the new GitKraken DevEx platform. — [GitKraken press release](https://gitkraken.com/press/gitkraken-acquires-codesee-launches-devex-platform)
  - In 2026 GitKraken markets "GitKraken Insights" as a standalone Git-metrics product ("turns raw Git data into clear, useful metrics"). It is not a code map. — [GitKraken docs, 2026](https://help.gitkraken.com/gk-insights/gk-insights/)
  - A third-party failure write-up attributes CodeSee's shutdown to an inability to convert free users to paying customers. This is a weak secondary source. — [IdeaProof](https://ideaproof.io/failure/codesee)
  - CEO Shanea Leven went on to co-found Empromptu AI. — [Product Hunt profile](https://www.producthunt.com/@shanea_king_roberson)
- **Swimm (code-coupled docs)**
  - Raised $27.6M Series A (Insight Partners, Nov 2021), ~$33.3M total. No new round found through Oct 2026. — [TechCrunch 2021](https://techcrunch.com/2021/11/08/swimm-nabs-27-6m-series-a-to-include-up-to-date-documentation-in-every-release/); [YesPress](https://yespress.io/swimm.md)
  - March 2026: "Swimm 2.0, the understanding platform for AI modernization". It uses deterministic static analysis to extract business rules and data flows (COBOL, CICS, JCL), with AI "only as a translation layer", plus an MCP server that feeds validated knowledge to agents. — [Swimm blog](https://swimm.io/blog/swimm-2-0-the-understanding-platform-for-ai-modernization)
  - 2026-05-06: the CEO announced "Swimm is becoming a service company. From Software as a Service to Service as Software… The unit of value is the project, not the seat." Fixed-price stages run Assessment, Specification, Modernization, Enablement.
  - Stated reasons: AI tools go stale within months, and procurement and integration of yet another tool "has become slower and slower". — [Swimm blog, 2026-05-06](https://swimm.io/blog/weve-stopped-asking-customers-to-bet-on-the-right-tool)
- **Sourcegraph and Amp**
  - 2025-06-25: Sourcegraph ended Cody Free and Pro and removed Cody from Enterprise Starter (access cut 2025-07-23). Users were pushed to Amp, with the explanation that "AI models can now handle more complex, autonomous development tasks." — [Sourcegraph blog](https://sourcegraph.com/blog/changes-to-cody-free-pro-and-enterprise-starter-plans)
  - 2025-12-02: Sourcegraph and Amp became independent companies. Dan Adler is CEO of Sourcegraph (enterprise code search and understanding). Quinn Slack and Beyang Liu run Amp Inc. ("frontier coding agents"; Amp says it is profitable). The rationale given was the products' "fundamentally different distribution and audiences". — [Sourcegraph blog](https://sourcegraph.com/blog/why-sourcegraph-and-amp-are-becoming-independent-companies); [Amp news](https://ampcode.com/news/amp-inc)
- **Greptile**
  - Started in 2023 as "an AI expert that understands large codebases": codebase chat plus an API ($4.1M seed). — [YC launch](https://www.ycombinator.com/launches/Kcc-greptile-ai-expert-that-understands-large-codebases); [Maginative](https://www.maginative.com/article/greptile-raises-4-5m-to-create-an-ai-expert-for-your-codebase/)
  - Then pivoted to AI **code review**. A founder profile explains the logic: codebase chat "was impressive, but code review sat inside a recurring workflow with a clear buyer and an obvious cost of failure." This is single-source. — [YesPress profile](https://yespress.io/daksh-gupta)
  - $25M Series A led by Benchmark, announced 2025-09-23 with Greptile v3. — [Greptile blog](https://www.greptile.com/blog/series-a); [SiliconANGLE](https://siliconangle.com/?p=712589). In July 2025 TechCrunch had reported talks at a $180M valuation. — [TechCrunch](https://techcrunch.com/2025/07/18/benchmark-in-talks-to-lead-series-a-for-greptile-valuing-ai-code-reviewer-at-180m-sources-say)
  - Homepage (Nov 2026): "AI Code Reviewer… central validation layer" for other coding agents. Claims "22,000+ teams" (vendor claim). Pricing: free for one developer (50 credits), then $1 per credit with no seat fees. Codebase chat is no longer marketed. — [greptile.com](https://www.greptile.com/)
  - A search summary mentioned a $50M Series B led by Menlo; this is **unverified**, as the fetched homepage did not show it.
- **Augment Code (Context Engine)**
  - Raised $252M total, including a $227M Series B at ~$977M post-money (April 2024). — [Analytics India Mag](https://analyticsindiamag.com/github-copilot-rival-augment-secures-252-mn-at-1-bn-valuation-to-boost-ai-for-developers/)
  - Moved to usage-based pricing on 2025-10-20. — [The Register](https://www.theregister.com/2025/10/15/augment_pricing_model/)
  - On 2026-02-06 it shipped **Context Engine MCP**, which lets Claude Code, Cursor, Zed or any MCP agent use Augment's semantic index. — [Augment changelog](https://www.augmentcode.com/changelog/context-engine-mcp-in-ga); [SiliconANGLE](https://siliconangle.com/?p=730231)
  - Per-query cost reportedly ~$0.03–$0.06 (LLM tokens + 40% fee). Third-party, conflicting. — [Ry Walker](https://rywalker.com/research/augment-context-engine)
  - Third-party reviews report that inline completions were sunset for non-Enterprise plans (March 2026) and that plans were restructured. **Unverified**. — [fast.io review](https://fast.io/resources/augment-ai-review-2026/)

**D. Context packers, platform features and agent-native diagram skills**

- **Repomix**: 29.3k stars, MIT licensed. Packs a repo into one AI-friendly file and has an MCP server (`repomix --mcp`). Sponsored by Warp and CodeRabbit. — [GitHub](https://github.com/yamadashy/repomix)
- **Gitingest**: 16.2k stars, MIT licensed. Swap "hub" for "ingest" in a GitHub URL. Has browser extensions. — [GitHub](https://github.com/coderamp-labs/gitingest)
- **GitHub Copilot Spaces**
  - Bundles files, PRs, issues and whole repos as shared context. Attached content "stays in sync as it changes". Available in the IDE through the remote GitHub MCP server. Org-shareable. Same billing as Copilot Chat.
  - The GitHub changelog dates the GA to 2025-09-24. A search summary attributed a GA post to 2026-06-02 (conflict; the fetched page shows 2025-09-24). — [GitHub changelog](https://github.blog/changelog/2025-09-24-copilot-spaces-is-now-generally-available/)
  - The Spaces API went GA on 2026-05-18. — [GitHub changelog](https://github.blog/changelog/2026-05-18-copilot-spaces-api-now-generally-available)
  - Attaching a repo makes Copilot search it and pull only relevant content; it does not load the whole project. — [GitHub docs](https://docs.github.com/en/copilot/concepts/spaces)
- **Claude Code, Cursor and Codex**
  - No first-party "architecture diagram" feature was found. Diagram generation happens through community skills and plugins that make the agent emit Mermaid, PlantUML or HTML/SVG:
    - **Archify**: the agent emits a typed JSON IR that is deterministically compiled to HTML/SVG, so diagrams are "verifiable". Star counts conflict (13k+ vs 36k). — [Better Stack guide](https://betterstack.com/community/guides/ai/archify-architecture/); [bswen, 2026-08-28](https://docs.bswen.com/blog/2026-08-28-archify-claude-code-cursor-codex-architecture-diagrams)
    - Floorplan — [README](https://raw.githubusercontent.com/haydenschmitty/floorplan/main/README.md)
    - PrefXplain — [PyPI](https://pypi.org/project/prefxplain/)
    - GitNexus's "generate map" prompt that writes ARCHITECTURE.md with diagrams — [GitNexus docs](https://www.mintlify.com/abhigyanpatwari/GitNexus/api/prompts/generate-map)
  - Practical meaning: any user of a frontier coding agent can get a Rassam-like diagram for free with a one-line skill.

**E. Historical fates (pre-LLM visualization tools)**

- **Sourcetrail** (Coati Software): an interactive source explorer and graph visualizer. It went free and open source in Nov 2019 after abandoning its commercial license. — [InfoWorld](https://www.infoworld.com/article/2264662/sourcetrail-code-navigator-now-free-open-source.html). It was discontinued at the end of 2021 (repo archived 2021-12-14) despite 16.5k stars. The README gives no reason inline. — [GitHub](https://github.com/CoatiSoftware/Sourcetrail)
- **Visual Studio UML designers**
  - Announced 2016-10-14: Microsoft removed code-generated class diagrams and sequence-diagram visualization of code because the UML tools "were used by very few customers", confirmed by sales and support data. It kept the live Layer (dependency-validation) designer. — [Microsoft DevOps blog](https://devblogs.microsoft.com/devops/uml-designers-have-been-removed-layer-designer-now-supports-live-architectural-analysis/); [InfoWorld](https://www.infoworld.com/article/3131600/uml-to-be-ejected-from-microsoft-visual-studio.html)
  - The UML designers were fully gone from VS 2017 "due to lack of usage within the community." — [Microsoft Premier Developer blog, 2018](https://devblogs.microsoft.com/premier-developer/visualize-code-with-visual-studio/)
  - Note the survivor: Microsoft kept the tool that **enforces** architecture against code (layer validation), not the one that merely depicts it.

### Inferences
- Free plus distribution beats paid in this niche. The leading "repo → wiki/diagram" offerings are free (DeepWiki, Code Wiki, GitDiagram, deepwiki-open, Copilot Spaces bundled in Copilot). They are subsidized by an agent business (Cognition), a cloud and model business (Google), or a platform (GitHub). A standalone product selling the same artifact faces a price ceiling near zero.
- The successful repositioning pattern is "understanding as infrastructure for agents or for a paid workflow". Examples: Greptile (review), Augment (Context Engine MCP), Swimm (MCP plus modernization services), IcePanel and Structurizr (MCP), Codemaps (`@codemap` in agent prompts). The pattern is not "understanding as a picture for humans".
- Feature-level threat: Codemaps already does task-scoped, code-linked, agent-referenceable maps, and Code Wiki already auto-regenerates diagrams on every change. Those are exactly the two directions Rassam might otherwise pivot toward.
- An open spot remains: Cognition's ".codemap protocol" was announced as a future direction but no published spec was found. An open, portable, verifiable architecture-map format for agents and humans is unclaimed as of these sources.

### Gaps
- No official 2026 usage numbers were found for DeepWiki, Code Wiki or Codemaps. The 1.4M-repo figure is secondary.
- No independent revenue or traction figures for CodeViz, Eraser, IcePanel or GitDiagram.
  - A directory claim of IcePanel at ~$2M ARR (2025) and $3.5M ARR (July 2026) surfaced in search, but its origin could not be verified.
  - CodeViz's "70k+ developers" is a vendor claim.
- Sourcetrail's stated reason for discontinuation (blog post) was not retrieved.
- CodeSee's total funding and exact shutdown date were not confirmed from a primary source.
- The Greptile Series B claim ($50M, Menlo) is unconfirmed.
- No first-party Cursor, Claude Code or Codex "architecture overview" features were confirmed; search returned only community skills. Hacker News launch-thread sentiment for DeepWiki and Codemaps was not collected (search budget exhausted).

---

## 2. Research evidence: does software visualization help comprehension, and why was it rarely adopted?

### Takeaway
Program comprehension dominates developer time (~58% in the largest field study; 70% in an earlier small study), so the problem is real. But the software-visualization field has a weak evidence base and a long record of low adoption: 62% of proposed approaches were never evaluated. Positive controlled results (such as CodeCity) exist, but mainly in lab settings with specific question-answering tasks. Developers' real diagramming is informal, transient and selective.

### Cited Findings
- **Comprehension time**
  - Xia, Bao, Lo, Xing, Hassan and Li ran a field study of **78 professionals** across 7 projects in two companies, tracking interaction data across all applications. They found program comprehension takes **~58% of developers' time** on average. — [IEEE TSE 2018, vol. 44 no. 10, pp. 951–976 (PDF)](https://baolingfeng.github.io/papers/tsecomprehension.pdf); [author copy](https://xin-xia.github.io/publication/TSE17.pdf)
  - Sources report the observation total as 3,148 or 3,244 working hours (conflict). — [SMU](https://ink.library.smu.edu.sg/sis_research/3779)
  - The same paper cites earlier estimates: Zelkowitz et al. (more than half of time), and Minelli et al. (~70%, but only seven professional participants). — [Xia et al. PDF](https://baolingfeng.github.io/papers/tsecomprehension.pdf)
- **Evaluation gap (Merino et al.)**
  - Merino, Ghafari, Anslow and Nierstrasz reviewed 387 SOFTVIS/VISSOFT papers and included 181. They found "62% of the proposed software visualization approaches do not include an evaluation."
  - They argue that adoption requires evaluations with "participants of the target audience and real-world software systems", and recommend surveying developers' frequent and complex problems first. — [Merino et al., JSS 2018, project page](https://scg.unibe.ch/research/softvis-eval); [BORIS](https://boris.unibe.ch/126936)
  - The authors suspect low adoption stems from "unproved effectiveness and lack of evaluations." A 2017 companion paper says that using visualization during development "is not a common practice." — [Merino 2017 PDF](https://scg.unibe.ch/archive/papers/Meri17a.pdf)
- **Modern software visualization review**: Chotisarn, Merino et al. (2020) screened 1,440 entries and kept 105 papers (2013–2019). It again notes limited adoption despite many proposed visualizations. — [arXiv 2003.00643](https://arxiv.org/pdf/2003.00643)
- **CodeCity (code cities)**
  - Wettel, Lanza and Robbes, ICSE 2011: a controlled experiment with 41 participants (academia and industry, 4 sites, 3 countries). CodeCity produced a **statistically significant increase in correctness and decrease in completion time** compared with a non-visual baseline (Eclipse plus a spreadsheet). — [ICSE 2011 page](https://2011.icse-conferences.org/content/software-systems-cities-controlled-experiment.html); [tech report listing](https://www.inf.usi.ch/faculty/lanza/PUBS/M/Wett2010a.pdf)
  - Romano et al. (2019): the city metaphor on a standard screen **and** in immersive VR significantly improved correctness on comprehension tasks compared with Eclipse. — [Romano et al. 2019](https://www.inf.usi.ch/faculty/lanza/PUBS/J/Roma2019a.pdf)
  - Even so, CodeCity never became a mainstream tool (an inference: no adoption data was found).
- **VR and immersive visualization**: a 2023 systematic review of VR visualization found few standard guidelines and heavy use of game engines that are "not convenient for critical scientific studies". — [Korkut & Surer, Virtual Reality 2023 (arXiv 2203.07616)](https://arxiv.org/abs/2203.07616). A review of VR in software-engineering education found only nine head-mounted-display papers, mostly small pilots. — [arXiv 2204.12008](https://arxiv.org/pdf/2204.12008)
- **UML in practice (Petre)**
  - ICSE 2013: interviews with 50 professional engineers at 50 companies. Per secondary summaries: 35 did not use UML, 11 used it selectively, 3 for code generation, 1 retrofitted it for a client, and **none were wholehearted adopters**.
  - Non-users cited notation overhead and "issues of synchronization and consistency". Selective users treated UML as a "thought tool" and for stakeholder communication, usually in early design or in implementation, rarely both. — [ICSE 2013 page](https://2013.icse-conferences.org/content/uml-practice.html); [Never Work in Theory summary](https://neverworkintheory.org/2013/06/13/uml-in-practice-2.html); [Petre 2014 follow-up](https://oro.open.ac.uk/41542)
- **Developers' drawings (Cherubini et al.)**
  - Cherubini, Venolia, DeLine and Ko, CHI 2007 (Microsoft survey plus interviews): most drawings are **transient** and support understanding, design and communication. The cost of turning whiteboard sketches into electronic form means design decisions captured in drawings were "often… subsequently lost." — [PDF](https://faculty.washington.edu/ajko/papers/Cherubini2007DevelopersDrawCode.pdf); [MSR](https://www.microsoft.com/en-us/research/?p=154511)
  - A 2022 follow-up survey of architects on whiteboard meetings found that **only 6 of 46** had used ADRs. — [arXiv 2210.16089](https://arxiv.org/pdf/2210.16089)
- **Onboarding**
  - Dagenais et al. (ICSE 2010), a grounded theory of 18 newcomers in 18 projects: newcomers are "explorers" in a project "landscape". Integration runs through early experimentation, internalizing structures and cultures, and progress validation. The recommendations are to guide newcomers along commonly traveled routes and help them interpret project-specific features. — [PDF](https://www.cs.mcgill.ca/~martin/papers/icse2010.pdf)
  - A 2024 systematic review covers software solutions for newcomer onboarding. — [arXiv 2408.15989](https://arxiv.org/html/2408.15989v1)
- **LLM help for comprehension**
  - Nam et al., ICSE 2024: a 32-participant user study. An in-IDE LLM assistant (GILT) with prompt-less code explanations aided task completion and understanding **more than web search**. Benefits varied by experience, and students and professionals used it differently. — [arXiv 2307.08177](https://arxiv.org/abs/2307.08177v3)

### Inferences
- The research supports visualization for specific, well-posed comprehension questions ("which classes are god classes?", "what calls X?") rather than for general "overview" browsing. Lab wins (CodeCity) did not become field adoption.
- The recurring adoption killers in the literature are:
  - no evaluation with real developers on real systems;
  - mismatch with developers' actual questions;
  - synchronization and consistency costs (Petre);
  - the cost of making diagrams persistent (Cherubini).
- LLMs remove the cost of creating a diagram, but not the costs of trusting it, keeping it in sync, or fitting it to the task.
- The comprehension bottleneck likely grows when agents write more of the code. Cognition's rationale says this explicitly. But the consumer of comprehension artifacts is increasingly the agent itself, plus the human reviewer of agent output.

### Gaps
- Exact CodeCity effect sizes and per-task results were not retrieved (the PDFs returned 404/403).
- No post-2018 replication or update of the 58% comprehension-time figure was found, including how it shifts with AI assistants. A search on "comprehension debt" was blocked by the search budget.
- No systematic review dedicated specifically to software-visualization **adoption barriers** (as opposed to evaluation) was found.
- No controlled study was found comparing AI-generated architecture diagrams with text wikis or chat for onboarding outcomes.

---

## 3. Architecture documentation practice: C4, ADRs, diagrams-as-code, and documentation drift

### Takeaway
There is solid evidence that architecture documentation goes stale and that staleness is the top documentation problem. Practices that keep artifacts alive tie them to code and process: models as code in the repo, ADRs stored where developers work, live validation. Even then, adoption of ADRs and C4 tooling stays niche and uneven.

### Cited Findings
- **Documentation issues (Aghajani et al.)**
  - ICSE 2019 analyzed 878 artifacts (mailing lists, issues, PRs, forums) and built a taxonomy of documentation issues. — [ICSE 2019 PDF](https://emadpres.github.io/pdfs/icse2019.pdf)
  - "Up-to-dateness" problems make up **39% of documentation content issues**, and outdated docs go stale silently with no crashes or errors. This figure is from a secondary citation by Tan, Wagner and Treude. — [EMSE 2023](https://link.springer.com/content/pdf/10.1007/s10664-023-10397-6.pdf)
  - The 2020 follow-up surveyed 146 practitioners to validate the taxonomy. — [ICSE 2020 PDF](https://www.inf.usi.ch/faculty/lanza/PUBS/P/Agha2020a.pdf)
- **Fraunhofer IESE survey (~2013–14)**: 147 industrial developers confirmed that architecture documentation is "most frequently outdated, updated only with changes", and linked this to architecture erosion. — [Fraunhofer IESE PDF](https://www.iese.fraunhofer.de/content/dam/iese/dokumente/alte-dateien/study_software_architecture_documentation_for_developers_survey-en-fraunhofer_iese.pdf)
- **Other stakeholder studies**
  - A Brazilian study lists outdated architecture documentation and implementation out of sync with architecture among the main problems. — [arXiv 1510.06229](https://arxiv.org/pdf/1510.06229)
  - A 2025 interview study on architecture explanations reports that documented information "quickly becomes outdated and inconsistent." — [arXiv 2503.08628](https://arxiv.org/pdf/2503.08628)
- **ADRs**
  - A GitHub mining study (Buchgeher et al., IEEE Access 2023) found adoption "still low" but growing yearly. — [DOAJ](https://doaj.org/article/f838f2a538ea48e7a3b15ce99befe612)
  - A 2026 analysis reports that ~50% of repos that start ADRs have fewer than five records. — [arXiv 2604.03826](https://arxiv.org/html/2604.03826)
  - ICSA 2026: of 5,800 ADRs in open source, ~63% were opened directly as "accepted", which suggests ADRs are often after-the-fact records. — [ICSA 2026](https://conf.researchr.org/details/icsa-2026/icsa-2026-papers/34/Architecture-Decision-Records-Adoption-Impact-and-Developer-Engagement-in-Open-Sou)
  - Industrial action research: developers found ADRs useful, but "sustained efforts are necessary". Barriers were culture, tacit knowledge, process and tools. — [Chalmers](https://research.chalmers.se/en/publication/538920)
  - ECSA 2024: "where documentation is stored has a massive influence on its perceived usefulness", and team cooperation improved after ADRs were introduced. — [ECSA 2024](https://conf.researchr.org/details/ecsa-2024/ecsa-2024-research-papers/9/Introducing-Architecture-Decision-Records-in-Practice-An-Action-Research-Study)
- **Diagrams-as-code and C4**
  - Structurizr's model-as-code approach (DSL in the repo, CLI and GitHub Action) is designed to version, diff and regenerate diagrams. — [Structurizr docs](https://docs.structurizr.com/as-code)
  - Mermaid's ~85k stars and its role as the default LLM diagram output show that diagrams-as-code won as an **interchange format**. — [Taskade](https://www.taskade.com/blog/history-of-mermaid.md)
  - No quantitative 2026 C4 adoption survey was found.
- **Live checks vs pictures**: Microsoft kept the Layer designer's "live architectural analysis" (validating code against declared layers) while removing pure UML depiction tools. — [Microsoft DevOps blog, 2016](https://devblogs.microsoft.com/devops/uml-designers-have-been-removed-layer-designer-now-supports-live-architectural-analysis/)
- **Today's auto-sync answers**:
  - Code Wiki regenerates on every change. — [Google](https://developers.googleblog.com/introducing-code-wiki-accelerating-your-code-understanding/)
  - Eraserbot advertises "codebase diagrams that update themselves." — [Eraser](https://www.eraser.io/pricing)
  - CodeViz advertises diagrams linked to source and versioned in Git. — [CodeViz](https://www.codeviz.ai/)

### Inferences
- What keeps architecture artifacts alive:
  1. Regeneration from code, which is now cheap with LLMs plus static analysis.
  2. Storage in the repo or PR flow.
  3. Enforcement or validation (fitness functions, layer checks), so drift causes a visible failure instead of silent staleness.
- A manually edited canvas saved in browser localStorage, which is Rassam's current model, is structurally the kind of artifact the literature says goes stale. Manual edits are also exactly what auto-regeneration overwrites.
- An unexploited niche is the human-authored intent (decisions, desired boundaries) vs machine-recovered reality (actual dependencies) diff, where drift becomes a signal. ADR and C4 research suggests intent is rarely written down. LLMs could draft it, but it needs a home and a check.

### Gaps
- No 2024–2026 quantitative survey of C4 or diagrams-as-code adoption was found.
- No study was found measuring how long auto-generated docs or diagrams (DeepWiki, Code Wiki) remain accurate, or whether teams trust them.

---

## 4. LLM-generated diagrams and architecture recovery: accuracy and hallucination evidence

### Takeaway
Frontier LLMs are now very good at answering targeted architectural questions about mid-sized systems (≈98% mean accuracy in a 2026 ROS2 study) and at broad styles and structure. They remain weakest at fine-grained **relationships** (class relationships, design patterns), and errors concentrate in the largest, most complex systems. Adding static dependency context measurably helps. There is still no independent hallucination-rate study of DeepWiki-style products.

### Cited Findings
- **ECSA 2025 (Santilli, De Luca, Amalfitano, Fasolino, Pelliccione)**
  - Tested four off-the-shelf LLMs (named in later work as GPT-4o, Gemini 1.5 Pro, Claude 3.5 Sonnet and Mistral Large) on class-diagram recovery, design- and architectural-pattern detection, and architectural-style identification, with self-reflection.
  - Result: "LLMs can support SAR activities", especially structural and stylistic elements, but they "struggle with class relationships and fine-grained design patterns." — [ECSA 2025 listing](https://conf.researchr.org/details/ecsa-2025/ecsa-2025-call-for-research-papers/7/Automated-Software-Architecture-Design-Recovery-from-Source-Code-Using-LLMs); summary in [SAKE benchmark, arXiv 2606.29520](https://arxiv.org/pdf/2606.29520)
- **ROS2 architectures (Duits, El Moutaouakil, Malavolta, arXiv 2026-04-23)**
  - 1,230 generated architectural questions over 3 ROS2 systems, with ground truth from running and monitoring the systems, across 9 LLMs.
  - **Mean accuracy 98.22%**: gemini-2.5-pro 100%, o3 99.77%, gemini-2.5-flash 99.72%, gpt-4.1 95% (lowest).
  - Incorrect answers concentrated on the most complex system (249 of the incorrect answers, out of the 300 total the summary reports).
  - Explanation coherence ranged only 0.394–0.762 by question type. — [arXiv 2604.21699](https://arxiv.org/abs/2604.21699)
  - Note that the incorrect-answer count reported in the summary is inconsistent with 98.22% mean accuracy unless counted differently across models; verify in the paper.
- **UML class diagrams from code (Siala & Lano, STAF/A-MDE 2025)**: five open LLMs (StarCoder2, LLaMA, CodeLlama, Mistral, DeepSeek). All scored higher on Python than on Java. DeepSeek and Mistral were best; LLaMA was lowest. — [researchr](https://conf.researchr.org/details/staf-2025/a-mde-2025-papers/6/Using-LLMs-to-Extract-UML-Class-Diagrams-from-Java-and-Python-Programs-An-Empirical-)
- **LLM-assisted modelling with novices (from text, not code)**: identifying class-diagram **relationships was the weakest element, at 24.44% correctness**. Sequence diagrams averaged 74.81%. — [arXiv 2404.17739](https://arxiv.org/pdf/2404.17739)
- **ArchAgent (arXiv 2026-01-19, to appear at ICASSP 2026)**: static analysis, adaptive code segmentation and LLM synthesis recover multiview, business-aligned architectures across repositories. Its ablation shows that **dependency context improves accuracy** on production repos. The abstract gives no numeric metrics. — [arXiv 2601.13007](https://arxiv.org/abs/2601.13007)
- **Agentic UML generation from repositories**: a context-engineering approach evaluated on 12 OSS repos (2026). Only the abstract was seen. — [arXiv 2605.24453](https://arxiv.org/pdf/2605.24453)
- **Repository documentation quality**: CodeWiki 68.79% vs DeepWiki 64.06% on CodeWikiBench, a rubric-based, LLM-judged benchmark built by the authors. — [arXiv 2510.24428](https://arxiv.org/abs/2510.24428)
- **Practitioner reports of DeepWiki errors**: confident hallucinations about configuration and commands. — [OpenWrt forum](https://forum.openwrt.org/t/important-consideration-deepwiki-ai-generated-docs-may-contain-inaccuracies/249471)
- **Vendor design choices that implicitly acknowledge hallucination risk**:
  - Swimm uses deterministic static analysis with AI "only as a translation layer". — [Swimm](https://swimm.io/blog/swimm-2-0-the-understanding-platform-for-ai-modernization)
  - Archify compiles a typed IR deterministically so diagrams are "verifiable". — [Better Stack](https://betterstack.com/community/guides/ai/archify-architecture/)
  - DeepWiki scores files with symbol graphs and git history before the LLM writes. — [ZenML](https://www.zenml.io/llmops-database/auto-generated-codebase-documentation-and-intelligence-at-scale)
  - Codemaps link every node to exact code locations. — [Cognition](https://cognition.com/blog/codemaps)
- **Adjacent: architecture-documentation-to-code traceability with LLMs**: Fuchß et al. compare against SWATTR, TransArC and ArDoCo. — [arXiv 2511.02434](https://arxiv.org/html/2511.02434v1)

### Inferences
- In a Rassam-style flowchart, the edges (relationships) are exactly the element LLMs get wrong most often. Nodes and categories (API, DB, Auth) map to the high-accuracy "broad structure and style" tasks.
- A credible product should derive edges from static analysis (imports, call graphs, runtime traces), use the LLM for naming, grouping and explanation, and show provenance (a link to the code) for every edge.
- Accuracy on question-answering is already near-ceiling for mid-size systems with top models. The differentiator is no longer "can an LLM describe architecture?" but verifiability, scale (large or multi-repo systems) and consistency over time.

### Gaps
- No independent study was found measuring hallucination rates in DeepWiki, Code Wiki or Codemaps outputs, and no user study of DeepWiki-like docs (trust, onboarding speed) was found.
- Exact numbers in the ECSA 2025 paper (per-task accuracy, error taxonomy, self-reflection effect) were not retrieved.
- No study was found on LLM accuracy at generating **diagram edges** at whole-repo scale against a static-analysis ground truth.

---

## 5. Lessons: patterns that predict success or failure of a visualization-first developer product

### Takeaway
The evidence consistently favors tools that are:
1. embedded in a recurring workflow with a clear buyer (review, PR, agent context, modernization project);
2. automatically synced to code, or enforcing rules against code;
3. scoped to a specific question or task;
4. verifiable, with links to code and static-analysis grounding.

Standalone, browse-the-big-picture visualizers, whether pre-LLM (Sourcetrail, VS UML, CodeSee) or LLM-era (pure repo-to-diagram), struggle to monetize or get adopted.

### Cited Findings
- **Workflow embedding and clear buyer**
  - Greptile's stated pivot rationale: chat "was impressive, but code review sat inside a recurring workflow with a clear buyer". — [YesPress](https://yespress.io/daksh-gupta). It now markets 22,000+ teams on review (vendor claim). — [Greptile](https://www.greptile.com/)
  - CodeSee, a standalone code-map product, shut down commercial operations and was absorbed into GitKraken. — [GitKraken](https://gitkraken.com/press/gitkraken-acquires-codesee-launches-devex-platform); [LinkedIn](https://sk.linkedin.com/in/daniel-ivanyi-16845458)
  - Microsoft dropped UML depiction tools for low usage. — [Microsoft](https://devblogs.microsoft.com/devops/uml-designers-have-been-removed-layer-designer-now-supports-live-architectural-analysis/)
- **Popularity is not a business**: Sourcetrail had 16.5k stars and was still discontinued. — [GitHub](https://github.com/CoatiSoftware/Sourcetrail). GitDiagram has 19k stars and runs on sponsorships and an ad slot. — [GitHub](https://github.com/ahmedkhaleel2004/gitdiagram)
- **Free distribution channel**: DiagramGPT, a free AI sidecar, drove ~30% of Eraser sign-ups. Free generators are top-of-funnel for a paid collaborative product, not the product itself. — [Growth Unhinged](https://www.growthunhinged.com/p/how-an-ai-sidecar-product-drove-30?open=false)
- **Auto-sync is now table stakes**:
  - Code Wiki regenerates after every change. — [Google](https://developers.googleblog.com/introducing-code-wiki-accelerating-your-code-understanding/)
  - Eraserbot offers self-updating diagrams. — [Eraser](https://www.eraser.io/pricing)
  - Copilot Spaces attached content "stays in sync". — [GitHub](https://github.blog/changelog/2025-09-24-copilot-spaces-is-now-generally-available/)
  - Staleness is the #1 documentation content issue (39%). — [Tan et al. citing Aghajani](https://link.springer.com/content/pdf/10.1007/s10664-023-10397-6.pdf)
  - UML non-users cite synchronization and consistency. — [Petre summary](https://neverworkintheory.org/2013/06/13/uml-in-practice-2.html)
- **Task- or question-scoped beats global overview**:
  - Codemaps are generated from "a task or question". — [Cognition](https://cognition.com/blog/codemaps)
  - CodeViz filters diagrams by the developer's task. — [HN summary](https://bestofai.com/article/launch-hn-codeviz-yc-s24-visual-maps-of-your-codebase-in-vs-code)
  - Merino et al. recommend starting from developers' frequent and complex problems. — [SCG](https://scg.unibe.ch/research/softvis-eval)
  - Prompt-less in-IDE explanations beat web search. — [Nam et al.](https://arxiv.org/abs/2307.08177v3)
- **Agent-facing interfaces**: MCP servers now exist for:
  - DeepWiki-adjacent and GitDiagram — [GitHub](https://github.com/ahmedkhaleel2004/gitdiagram)
  - Repomix — [GitHub](https://github.com/yamadashy/repomix)
  - Augment Context Engine — [Augment](https://www.augmentcode.com/changelog/context-engine-mcp-in-ga)
  - Swimm 2.0 — [Swimm](https://swimm.io/blog/swimm-2-0-the-understanding-platform-for-ai-modernization)
  - IcePanel — [IcePanel](https://icepanel.io/pricing)
  - Structurizr — [Structurizr](https://docs.structurizr.com/ai)
  - Copilot Spaces, via the GitHub MCP server — [GitHub](https://github.blog/changelog/2025-09-24-copilot-spaces-is-now-generally-available/)
- **Value capture is moving to outcomes**: Swimm moved from seats to fixed-price modernization projects, citing tool churn and procurement friction. — [Swimm, 2026-05-06](https://swimm.io/blog/weve-stopped-asking-customers-to-bet-on-the-right-tool). Sourcegraph killed its self-serve AI assistant tiers in favor of an agent product. — [Sourcegraph](https://sourcegraph.com/blog/changes-to-cody-free-pro-and-enterprise-starter-plans)
- **Enforcement survives longer than depiction**: VS kept live layer validation. — [Microsoft](https://devblogs.microsoft.com/devops/uml-designers-have-been-removed-layer-designer-now-supports-live-architectural-analysis/). Structurizr enforces C4 rules. — [Structurizr](https://docs.structurizr.com/ai)

### Inferences
Success and failure predictors, synthesized:

| Predicts success | Predicts failure |
|---|---|
| Runs on every PR, commit or agent turn | Opened occasionally for "overview" |
| Regenerated or validated from code automatically | Manually maintained, or stored outside the repo |
| Answers a named question (impact of this change, how this flow works, what the agent touched) | Generic whole-repo picture |
| Edges grounded in static analysis, with per-claim code links | LLM-only relationships with no provenance |
| Consumed by agents (MCP) and humans | Human-only canvas |
| Sold on an outcome (review caught a bug, modernization finished) | Sold per seat as "documentation" |

### Gaps
- Retention and usage data for any visualization product was not found, so these predictors are inferred from fates and positioning, not from cohort data.
- No direct evidence was found on willingness to pay for AI architecture diagrams specifically.

---

## Implications for Rassam

- **Don't compete on "GitHub URL → AI flowchart/wiki".** It is free from Cognition (DeepWiki, Codemaps), Google (Code Wiki, with auto-regenerated architecture, class and sequence diagrams), GitHub (Copilot Spaces) and open source (GitDiagram at 19k stars with MCP and video; deepwiki-open; agent skills like Archify). A small AGPL project cannot win on price, model quality or distribution there.
- **Fix the trust layer before anything else.** The research shows LLMs are weakest exactly at relationships (edges). Derive edges from static analysis (imports, call graph), keep the LLM for grouping, labels and explanations, and attach code provenance to every node and edge. "Verifiable architecture" is still a weakly occupied position (Archify-style IR, Swimm's deterministic analysis).
- **Make sync automatic and repo-resident.** A manual "Sync" button and localStorage-only canvases match the documented failure mode of stale diagrams. Store the map as a versioned file in the repo (an open format; Cognition's ".codemap protocol" is announced but unshipped) and regenerate or diff it on every commit or PR.
- **Pivot from "overview" to "question- or change-scoped" maps inside a recurring workflow.** The strongest candidates:
  - (a) PR and agent-run impact maps ("what did this change or this agent touch, and which boundaries did it cross?"). This rides the comprehension-debt rationale Cognition cites and the review workflow Greptile monetizes.
  - (b) Architecture drift and fitness checks: declared intent (C4 or ADR-like) vs recovered reality, failing CI when they diverge. This is the "enforcement outlives depiction" lesson from Microsoft's layer validation and Structurizr.
- **Treat agents as a primary user.** Expose the map through MCP as grounded context, and as a guardrail ("don't let the agent add a DB call from the UI layer"). Every serious competitor added MCP in 2025–26. The human canvas then becomes the review and approval surface for agent-proposed architecture changes.
- **Monetize outcomes or governance, not viewers.** The market moved this way: Swimm to fixed-price projects, Greptile to per-credit review, IcePanel to per-editor collaboration ($40–80). Free diagram generation is at most a top-of-funnel sidecar (DiagramGPT drove ~30% of Eraser sign-ups).
- **Build evidence early.** 62% of academic visualization tools were never evaluated, and adoption suffered. Benchmarks now exist: CodeWikiBench, and ROS2-style ground-truthed architecture questions. Publishing measured edge accuracy and staleness-detection results against DeepWiki or Code Wiki would be a credible differentiator for a small open-source project.
