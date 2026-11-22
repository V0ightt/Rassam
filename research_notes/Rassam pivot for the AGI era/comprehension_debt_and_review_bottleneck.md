# Comprehension Debt and the Verification/Review Bottleneck in AI-Generated Software (evidence to Nov 2026)

Evidence-strength tags used below: **[RCT]** randomized controlled trial; **[OBS-L]** large-scale observational/telemetry data; **[SURVEY]** self-reported survey; **[VENDOR]** data from a company that sells a related product; **[PREPRINT]** arXiv/working paper, not peer-reviewed; **[QUAL]** qualitative study; **[INCIDENT]** anecdote/case report; **[SECONDARY]** primary source not opened, figure taken from secondary coverage. Research date: 19 Nov 2026.

## 1. Productivity and delivery: does AI make software delivery faster?

### Takeaway
The "AI slows experts down" result (METR, July 2025) is now outdated by METR's own account. The Feb 2026 follow-up points to a speed-up, but its data is weak and affected by selection effects. Across 2025-2026, large telemetry and field studies agree on a consistent pattern: individual output rises (more PRs, more code, more tasks), but firm-level shipped output and delivery stability barely improve or get worse. The time saved writing code goes into review and verification.

### Cited Findings
- **[RCT] METR, 10 Jul 2025:** 16 experienced open-source developers worked 246 real issues in mature repos they already knew. With early-2025 tools (Cursor Pro, Claude 3.5/3.7 Sonnet) they took **19% longer**. Before the study they forecast a **24% speed-up**, and afterwards they still believed AI had made them **~20% faster**, a perception gap of roughly 40 points. — [METR](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)
- **[RCT, self-described "very weak"] METR follow-up, 24 Feb 2026:** The second study started Aug 2025 with 57 developers (10 returning, 47 new), 143 repos and 800+ tasks.
  - Returning developers: estimated change in task time **−18%** (faster), 95% CI −38% to +9%.
  - New recruits: **−4%**, CI −15% to +9%.
  - Both intervals cross zero.
  - **30-50% of developers** said they skipped submitting some tasks because they didn't want to do them without AI, and pay was cut from $150/hr to $50/hr. METR therefore calls the estimate likely a **lower bound** on the speed-up and is redesigning the study.
  - METR says the 2025 result no longer reflects current AI impact.
  — [METR uplift update](https://metr.org/blog/2026-02-24-uplift-update/)
- **METR progress report, Feb 2026:** says more recent models now cause "material acceleration", unlike early-2025 models. A separate METR note analysing Claude Code transcripts estimates **1.5x-13x** time savings, explicitly framed as an **upper bound**, not a productivity multiplier. — [METR progress report](https://metr.org/february-2026-progress-report.pdf); [METR transcript note, 17 Feb 2026](https://metr.org/notes/2026-02-17-exploratory-transcript-analysis-for-estimating-time-savings-from-coding-agents/)
- **[SURVEY] DORA 2024 (Google):** a 25% increase in AI adoption was associated with an estimated **−1.5% delivery throughput** and **−7.2% delivery stability**. — [DORA "Impact of Generative AI in Software Development"](https://dora.dev/ai/gen-ai-report/dora-impact-of-generative-ai-in-software-development.pdf)
- **[SURVEY] DORA 2025 "State of AI-assisted Software Development" (Sept 2025, ~5,000 respondents):**
  - AI adoption reached **90%** (+14 points year over year).
  - **>80%** say AI enhanced their productivity.
  - AI adoption is now **positively** associated with throughput, reversing 2024, but **still negatively associated with delivery stability**.
  - DORA's explanation: without strong control systems (automated testing, mature version control, fast feedback loops), more change volume leads to instability. Its core framing is that "AI is an amplifier".
  — [Google Cloud, 2025 DORA announcement](https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-2025-dora-report); [Google blog](https://blog.google/innovation-and-ai/technology/developers-tools/dora-report-2025/)
- **DORA guidance (2025):** time saved in code creation is often re-spent on auditing and verification. — [dora.dev "Balancing AI tensions"](https://dora.dev/insights/balancing-ai-tensions/)
- **[OBS-L][VENDOR] Faros AI "AI Productivity Paradox" (mid-2025):** telemetry from 10,000+ developers across 1,255 teams. High-AI-adoption teams:
  - complete ~21% more tasks and merge **98% more PRs**;
  - see PR **review time up 91%** and average **PR size up 154%**;
  - have **bugs per developer up 9%**.
  
  Faros found no measurable company-level improvement in delivery. — [Faros AI](https://www.faros.ai/ai-productivity-paradox)
- **[OBS-L][VENDOR][SECONDARY] Faros 2026 follow-up:** reportedly 22,000 developers and 4,000+ teams, with task throughput **+33.7%** and median time in code review **+441.5%**. The report is gated and the figure was not verified. Some blogs wrongly attribute the 441% figure to DORA. — [danilchenko.dev summary](https://www.danilchenko.dev/posts/ai-coding-productivity-paradox/); [coommit.com](https://coommit.com/blog/ai-code-review-bottleneck-2026)
- **[OBS-L][PREPRINT][SECONDARY] Harvard working paper, Chen & Stratton, "Artificial Intelligence in the Firm: Bottlenecks in Software Production" (~Oct 2026, Jellyfish data, reported as 718 firms; one outlet says 655):**
  - After coding-agent adoption, per-worker code volume rose **~30%**, but **firm-level shipped output did not measurably change**.
  - Review time rose **+49%**, PR submission-to-approval time **+56.1%**, and revision requests nearly doubled.
  - These estimates are *on top of* the effect of existing AI assistants.
  
  — [ComplexDiscovery](https://complexdiscovery.com/harvard-researchers-find-ai-coding-agents-shifted-the-bottleneck-to-code-review/); [Pondero, 12 Oct 2026](https://pondero.ai/news/2026-10-12-harvard-jellyfish-code-review-bottleneck/)
- **[RCT, field] Cui, Demirer et al. (2024/2025):** three field experiments at Microsoft, Accenture and a Fortune-100 firm (4,867 developers). Copilot access raised completed tasks by **~26%**, with larger gains for less-experienced developers. — [SSRN 4945566](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4945566)
- **[RCT] Google internal RCT (Oct 2024):** ~96 Google engineers were **~21% faster** on an enterprise task with AI features (wide confidence interval). — [arXiv 2410.12944](https://arxiv.org/abs/2410.12944)

### Inferences
- By late 2026 the debate is no longer whether AI speeds up writing code; it does, increasingly. The robust, repeated finding is that **the constraint moved downstream**: review, verification, integration and stability. DORA, Faros and Harvard (independent methods) all show code volume rising faster than delivered value.
- METR's 2025 perception gap matters beyond speed. Developers are poor at judging their own AI-assisted effectiveness, which suggests they may also misjudge how well they understand AI-written code.

### Gaps
- No 2026 DORA State report was found in searches. Blog posts titled "DORA 2026" appear to discuss 2025 data.
- The Harvard working paper PDF and the full Faros 2026 report were not opened, so all their figures are secondary.
- METR's redesigned study and its May 2026 "Task Substitution and Uplift" post ([METR](https://metr.org/blog/2026-05-08-task-substitution-and-uplift/)) were not reviewed in detail.

## 2. Code quality and maintainability of AI-assisted code

### Takeaway
Large-scale repository data (GitClear) shows rising duplication and churn and a collapse in refactoring/"moved" code since AI assistants spread. PR-level comparisons (CodeRabbit) find more issues in AI-co-authored PRs. Both sources are vendors and correlational, but they point the same way: code is growing faster than it is being consolidated or understood.

### Cited Findings
- **[OBS-L][VENDOR] GitClear, Feb 2025 (211M changed lines, 2020-2024, private repos plus 25 large OSS projects):**
  - "Copy/pasted" lines rose from **8.3% to 12.3%** (2021→2024).
  - Code blocks with 5+ duplicated lines grew **~8x** during 2024.
  
  — [GitClear 2025 research](https://www.gitclear.com/ai_assistant_code_quality_2025_research)
- **GitClear 2025, refactoring:** "moved" (refactoring-associated) lines fell from **25% of changed lines in 2021 to <10% in 2024**. — [GitClear 2025 research](https://www.gitclear.com/ai_assistant_code_quality_2025_research)
- **GitClear 2025, churn:** new code revised within two weeks grew from **3.1% (2020) to 5.7% (2024)**. — [jonas.rs summary](https://www.jonas.rs/2025/02/09/report-summary-gitclear-ai-code-quality-research-2025.html)
- **GitClear caveat:** the data is not line-level proof that the duplicated blocks were AI-written. The widely shared "40% of AI code is reverted" stat does **not** appear in GitClear's report. — [Mike Biggerstaff critique](https://www.mikebiggerstaff.me/writing/gitclear-40-percent)
- **[OBS-L][VENDOR][unverified] GitClear "The Maintainability Gap", June 2026 (623M changes, 2023-2026):** reports, vs 2022, **refactoring −70%**, **long-term legacy maintenance −74%**, **code-block duplication +81%**. Only the vendor's listing was seen; there is no independent coverage. — [GitClear research list](https://www.gitclear.com/recent_ai_developer_productivity_code_quality_research)
- **[OBS][VENDOR] CodeRabbit "State of AI vs Human Code Generation", 17 Dec 2025 (470 OSS PRs: 320 AI-co-authored, 150 human-only):**
  - AI PRs had **~1.7x more issues** (10.83 vs 6.45 per PR).
  - Per 100 PRs: **1.4x more critical** and **1.7x more major** issues.
  - Readability issues ~3x; logic/correctness issues +75%; performance inefficiencies (e.g., excessive I/O) ~8x.
  
  — [CodeRabbit report](https://www.coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report); [BusinessWire](https://www.businesswire.com/news/home/20251217666881/en/CodeRabbits-State-of-AI-vs-Human-Code-Generation-Report-Finds-That-AI-Written-Code-Produces-1.7x-More-Issues-Than-Human-Code); [VMblog](https://vmblog.com/archive/2025/12/17/coderabbit-s-state-of-ai-vs-human-code-generation-report-finds-that-ai-written-code-produces-1-7x-more-issues-than-human-code.aspx)
- **[OBS-L][VENDOR]** Faros (2025): bugs per developer **+9%** with high AI adoption. — [Faros AI](https://www.faros.ai/ai-productivity-paradox)
- **[OBS-L] GitHub Octoverse 2026:** agent-started PRs are more often multi-file (**~87% vs 79%** for PRs without detected agent involvement). — [GitHub Octoverse 2026](https://github.blog/2026-10-28-octoverse-commits-pushes-reach-new-highs-in-2026-as-developers-build-with-agents/)

### Inferences
- Duplication up and refactoring down means more code that is structurally redundant and less consolidated. That raises the amount a human must read to understand a system, which is the mechanism of comprehension debt at codebase scale.
- Agent PRs touching more files and growing in size (Faros +154%) means changes increasingly cut across architectural boundaries. Line-by-line review handles that poorly; a system-level view handles it better.

### Gaps
- No peer-reviewed longitudinal study isolating AI-authored lines' maintainability (e.g., defect density over 12+ months) was found.
- CodeRabbit's sample is small and from a vendor; it could not be checked for selection bias.

## 3. Security of AI-generated code and notable agent incidents

### Takeaway
Controlled benchmarks show roughly 45% of AI-generated code samples contain security flaws, with no clear improvement from bigger or newer models. Real-world incidents in 2025-2026 are mostly **architectural, configuration and permission failures** (databases deleted, environments recreated, public-by-default data) rather than subtle line-level bugs. Large firms are responding by adding human sign-off.

### Cited Findings
- **[OBS][VENDOR] Veracode 2025 GenAI Code Security Report (30 Jul 2025; updated Oct 2025):** tested code from 100+ LLMs on 80 tasks.
  - AI introduced security flaws in **45%** of tests.
  - **Java** was worst, at a **72%** failure rate.
  - Functional correctness improved over time, but security did not.
  
  — [BusinessWire](https://www.businesswire.com/news/home/20250730694951/en/AI-Generated-Code-Poses-Major-Security-Risks-in-Nearly-Half-of-All-Development-Tasks-Veracode-Research-Reveals); [Veracode Oct 2025 update](https://www.veracode.com/resources/analyst-reports/2025-genai-code-security-report/)
- **[OBS][PREPRINT] "Security in the Age of AI Teammates" (Jan 2026, AIDev data):** merge rates for security-related agentic PRs ranged from **49.6% (Copilot) to 86.6% (Codex)**. Security-relevant agent changes are routinely merged. — [arXiv 2601.00477](https://arxiv.org/html/2601.00477v2)
- **[OBS][VENDOR][SECONDARY]** CodeRabbit Dec 2025: secondary coverage reports **~2.74x** more security issues (e.g., XSS) in AI-co-authored PRs. — [vibegraveyard summary](https://vibegraveyard.ai/story/coderabbit-ai-code-quality-study/)
- **[OBS-L] GitHub Octoverse 2026:**
  - Push protection (secret scanning) ran **5.8B scans**, ~4x 2025's pace.
  - GitHub Advanced Security usage grew **>90% YoY**.
  - Merged Dependabot PRs were **>30M**, ~2x 2025's pace.
  
  — [GitHub Octoverse 2026](https://github.blog/2026-10-28-octoverse-commits-pushes-reach-new-highs-in-2026-as-developers-build-with-agents/)
- **[INCIDENT] Replit, July 2025:** during a declared code freeze, Replit's AI agent deleted data from SaaStr founder Jason Lemkin's production database. Replit's CEO called it "unacceptable", and Replit added dev/prod database separation. — [Unimon case compilation](https://unimon.co.th/en/blog/vibe-coding-failure-cases-lessons); [vibe-coding security tracker](https://pranava0x0.github.io/vibe-coding-security/advisories/ongoing-vibe-platform-exposure.html)
- **[INCIDENT][SECONDARY of FT] Amazon/AWS:**
  - In mid-Dec 2025, an AWS customer cost-calculator service had a **~13-hour interruption** after engineers let Amazon's **Kiro** coding agent make changes. The agent chose to "delete and recreate the environment".
  - Amazon said both incidents were "user error, not AI error" (an engineer had broader permissions than expected).
  - In **March 2026** the FT reported Amazon now requires **senior engineers to sign off on AI-assisted changes by junior/mid-level engineers**, after outages including a ~6-hour retail checkout disruption. Kiro's role in that disruption is disputed.
  
  — [OfficeChai](https://officechai.com/ai/amazon-requires-senior-engineers-to-sign-off-on-ai-assisted-changes-made-by-junior-and-mid-level-engineers-after-ai-related-outage/); [paddo.dev analysis](https://paddo.dev/blog/kiro-escalation/)
- **[INCIDENT][unverified]** A claimed April 2026 Cursor-agent incident that deleted a company database and its backups rests on a single secondary source. — [Unimon](https://unimon.co.th/en/blog/vibe-coding-failure-cases-lessons)
- Vibe-coding platform exposures (Lovable, RedAccess scan, Moltbook) are covered in section 7.

### Inferences
- The dominant failure mode in incidents is the human not grasping **what the agent could touch and what it changed at the system level**: prod vs dev, permissions, data exposure. Line-level SAST tools catch only part of this.
- Amazon's sign-off rule is a concrete example of the review bottleneck being *institutionalized*. Senior reviewer time becomes the scarce resource, which strengthens demand for tools that make reviews faster and more reliable.

### Gaps
- A reported Spring 2026 Veracode re-test finding an unchanged ~55% security pass rate appears only in secondary summaries; the primary was not opened. The CSA note on an "AI-generated CVE surge" was not opened. — [CSA research note](https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-generated-code-vulnerability-surge-2026/)
- No systematic incident database with counts of agent-caused production outages was found.

## 4. Skills, understanding, and "comprehension debt" / "cognitive debt"

### Takeaway
Several controlled studies from 2025-2026 show AI help improves task completion while reducing comprehension or learning. Anthropic's RCT found a 17-point mastery gap, mainly in debugging. The cognitive-psychology analogue (MIT "cognitive debt") and a Microsoft/CMU survey point the same way. *How* AI is used matters a lot: conceptual and explanatory use preserves learning, while delegation erodes it. "Comprehension debt" is now an established term in practitioner and academic writing.

### Cited Findings
- **[RCT] Anthropic, "How AI assistance impacts the formation of coding skills" (late Jan/Feb 2026; Shen & Tamkin; ~52 mostly junior developers learning the unfamiliar Trio async Python library):**
  - The AI-assisted group scored **~50%** on a follow-up mastery quiz vs **~67%** for the hand-coding group, a gap of about **17 points**. The largest gap was on **debugging** questions.
  - The speed advantage was **not statistically significant**.
  - Anthropic reports that usage patterns mattered: participants who used AI for conceptual questions and explanations retained more than those who delegated code generation.
  - Authors caution it is a short-term snapshot of learning a new library.
  
  — [Anthropic research](https://www.anthropic.com/research/AI-assistance-coding-skills); [InfoQ, Feb 2026](https://infoq.com/news/2026/02/ai-coding-skill-formation/)
- **[Controlled, within-subjects][PREPRINT] "Faster but Not Wiser" (Qiao, Shihab, Haque, Hundhausen; Nov 2025, rev. Sept 2026; 15 CS grad students, brownfield feature tasks in an unfamiliar codebase):**
  - Copilot **significantly improved task performance**, but **comprehension did not improve** (p = 0.59), and performance gains were not associated with comprehension gains.
  - Higher-comprehension participants did **4.7x more write-then-view verification loops** (p = 0.001).
  - Conclusion: "successful task completion does not reliably indicate code comprehension"; tools should support active verification.
  
  — [arXiv 2511.02922](https://arxiv.org/abs/2511.02922)
- **[Controlled][PREPRINT] "Programmers Are Poor and Overconfident Judges of LLM-Generated Assertions" (2026; 86 Python programmers):** natural-language explanations of LLM-generated assertions gave **no overall benefit**. Low-quality comments **reduced accuracy while increasing confidence**. — [arXiv 2607.08885](https://arxiv.org/html/2607.08885v1)
- **[Lab/EEG][PREPRINT] MIT Media Lab, Kosmyna et al., "Your Brain on ChatGPT: Accumulation of Cognitive Debt…" (June 2025):**
  - 54 participants wrote essays in three groups (LLM only, search engine, brain only), with EEG recording.
  - The LLM group showed the **weakest neural connectivity**, the **worst recall of their own text** and the **lowest sense of ownership**. Authors coin "cognitive debt".
  - Only 18 participants completed the crossover session; the sample is small and the study is a single task.
  
  — [arXiv 2506.08872](https://arxiv.org/abs/2506.08872)
- **Critique of the MIT study (2026):** lower connectivity does not necessarily mean lower engagement. — [arXiv 2601.00856](https://arxiv.org/pdf/2601.00856)
- **[SURVEY] Microsoft Research + CMU, Lee et al., CHI 2025 (319 knowledge workers, 936 first-hand GenAI use examples):** higher confidence in GenAI is associated with **less** critical thinking. Higher self-confidence is associated with **more**. GenAI shifts effort from producing work to verifying and integrating it. — [Microsoft Research](https://www.microsoft.com/en-us/research/publication/the-impact-of-generative-ai-on-critical-thinking-self-reported-reductions-in-cognitive-effort-and-confidence-effects-from-a-survey-of-knowledge-workers/)
- **Concept, "comprehension debt":** popularised by Addy Osmani (Google) in a widely reposted essay. It means the gap between the volume of AI-generated code in a system and how much of it humans actually understand; the codebase can "look fine" (tests pass, low complexity) while nobody knows why it works. — [O'Reilly Radar, Osmani](https://www.oreilly.com/radar/comprehension-debt-the-hidden-cost-of-ai-generated-code/); [Pagepro](https://pagepro.co/blog/comprehension-debt-ai-generated-code/)
- **Faros on comprehension debt:** frames it as accumulating when developers merge code they don't fully understand. — [Faros blog](https://www.faros.ai/blog/comprehension-debt-in-software-engineering)
- **[QUAL][peer-reviewed companion] Ahmad, "Comprehension Debt in GenAI-Assisted Software Engineering Projects" (EASE 2026 Companion; arXiv Apr 2026):** 621 reflective diaries from 207 undergraduates over 8 weeks.
  - Defines comprehension debt as the gap between what a team knows about its codebase and what it needs to know to maintain it. Unlike technical debt, it lives in collective cognition rather than in the code.
  - Four accumulation patterns: **AI-as-black-box acceptance, context-mismatch debt, dependency-induced atrophy, verification-bypass**.
  - One mitigating pattern: GenAI used as a **comprehension scaffold**.
  
  — [arXiv 2604.13277](https://arxiv.org/abs/2604.13277)
- **[Mixed-methods][PREPRINT] "How Do Practitioners Build SE Agents?" (July 2026):** teams **knowingly defer comprehension**. Handing bugs back to the AI was described as *bypassing* rather than repaying comprehension debt. Suggested mitigations were earlier review and summaries of what generated changes do. — [arXiv 2607.10856](https://arxiv.org/pdf/2607.10856)
- **[PREPRINT] "The Substrate Collapse" (June 2026):** argues that AI code generation **invalidates authorship-based knowledge metrics**. Git-blame-style "who knows this code" signals stop reflecting real understanding (title-level claim; full paper not read). — [arXiv 2606.20882](https://arxiv.org/pdf/2606.20882)
- **[SURVEY] Stack Overflow 2025:**
  - **20%** of respondents say AI made them "less confident in my own problem-solving".
  - **16.3%** say "it's hard to understand how or why the code works".
  
  — [Stack Overflow Survey 2025, AI](https://survey.stackoverflow.co/2025/ai)
- **[SURVEY] JetBrains 2025:** "potential negative impact on their own coding skills" is among developers' top-5 AI concerns. — [JetBrains Research](https://blog.jetbrains.com/research/2025/10/state-of-developer-ecosystem-2025/)
- **[SURVEY] Stack Overflow 2026:** among AI detractors, **17%** cite skill atrophy or self-replacement. — [Stack Overflow press release, 6 Oct 2026](https://stackoverflow.co/company/press/archive/stack-overflow-annual-developer-survey-ai-trust-conditional)

### Inferences
- The evidence supports the core hypothesis at the individual level: AI decouples *task completion* from *understanding*. The most consistent loss is in debugging and in explaining how code works, which are exactly the skills review and incident response need.
- Two findings show *active verification* behaviour is what preserves comprehension: more write-then-view loops in "Faster but Not Wiser", and conceptual-inquiry usage in the Anthropic study. Passive AI explanations do not reliably help (the 86-programmer study), and can increase overconfidence.
- If authorship no longer signals understanding (Substrate Collapse), organisations lose their implicit map of "who understands what". An explicit, maintained understanding model could fill that gap.

### Gaps
- No longitudinal study (more than 6 months) of professional teams measuring comprehension debt's downstream cost (incident MTTR, onboarding time) was found.
- Exact usage-pattern breakdowns in the Anthropic paper (per-pattern scores) were not verified from the primary text.
- Some widely circulated figures from the MIT study (e.g., "83% could not quote their essay") were not verified in the abstract.

## 5. The review bottleneck: PR volume, PR size, review time, acceptance of agent PRs, AI review tools

### Takeaway
PR volume has exploded. GitHub's merged PRs **more than tripled in two years to 1.3B/yr**, and over 40% of PRs now start with an agent. Review time and queueing delays have grown much faster than headcount. Agent PRs are now merged at rates comparable to human PRs. AI code review has become a funded category (CodeRabbit valued at $1.5B; Cursor bought Graphite), but field data suggests it has not removed the human bottleneck.

### Cited Findings
- **[OBS-L] GitHub Octoverse 2025 (window to Aug 2025):**
  - **43.2M PRs merged per month** on average (+23% YoY).
  - **518.7M** PRs merged in the year (+29%).
  - **986M+ commits** (+25%).
  
  — [GitHub Octoverse 2025](https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/)
- **[OBS-L] GitHub Octoverse 2026 (12 months to 30 Sept 2026, published 28 Oct 2026):**
  - **1.3B merged PRs**, more than tripled from 402M two years earlier (538M in 2025), ≈**3.5M/day**.
  - Commits reached **34.3B** across public and private repos (12.9B in 2025).
  - Share of PRs **started with an agent** rose from **17% (Mar 2026) to >40% (Sept 2026)**, with **110M agent-started PRs in Sept 2026** (~6x March).
  - Agent-involved PRs merged within two weeks went from **83% (Feb 2026) to 90% (Sept 2026)**, vs ~86% for others.
  - AI-assisted code review usage grew **>90% YoY**.
  - **264,000+** developers had used stacked PRs by Sept 2026, after a July 30 preview launch.
  - **55%** of Copilot monthly active users now use agentic features (35% a year earlier).
  
  — [GitHub Octoverse 2026](https://github.blog/2026-10-28-octoverse-commits-pushes-reach-new-highs-in-2026-as-developers-build-with-agents/). *Conflict:* a Simon Willison summary of the keynote cites "220 million merged PRs per month", which is inconsistent with GitHub's own ~3.5M/day (~106M/month). Prefer GitHub's text. — [Simon Willison](https://simonwillison.net/2026/Oct/28/github-octoverse-2026/)
- **[OBS-L][VENDOR]** Faros (2025): PR review time **+91%**, PR size **+154%**. Larger PRs were associated with longer reviews; Faros notes it cannot tell whether reviewers defer work or review more shallowly. — [Faros AI](https://www.faros.ai/ai-productivity-paradox)
- **[OBS-L][VENDOR][SECONDARY] LinearB 2026 benchmarks (8.1M PRs):** at P75, **agentic-AI PRs waited 1,055 minutes (~17.6 h) before a reviewer opened them, vs 201 minutes (~3.4 h) for unassisted PRs**. The review itself was only "somewhat slower", so most of the delay is queueing before review. Pickup multipliers are quoted inconsistently across write-ups (5.3x vs 2.47x). — [DEV summary of LinearB 2026](https://dev.to/butterneck/ai-pull-requests-need-an-owner-what-linearbs-2026-data-says-about-the-ai-code-review-bottleneck-1eb0)
- **[OBS-L][PREPRINT][SECONDARY] Harvard (Chen & Stratton, 2026):**
  - Agent adoption brought **+49% review time** and nearly doubled revision requests.
  - By March 2026 **80% of firms ran AI code-review tools**, but only **23% of review comments were AI-generated**, and AI review **did not remove the bottleneck**.
  - Interviews cite organisational rules, e.g., a single senior engineer allowed to approve, reviewing once a week.
  
  — [ComplexDiscovery](https://complexdiscovery.com/harvard-researchers-find-ai-coding-agents-shifted-the-bottleneck-to-code-review/)
- **[OBS][PREPRINT] Agentic PR acceptance (academic, AIDev dataset of agent-authored PRs from Codex, Copilot, Cursor, Devin, Claude Code):**
  - Task-stratified study of 7,156 PRs: acceptance was **Codex 79.9%, Cursor 74.4%, Claude Code 72.6%, Devin 68.0%, Copilot 68.0%**. Task type matters: there is a **29-point gap** between chores (84.0%) and performance work (55.4%). — [arXiv 2602.08915](https://arxiv.org/html/2602.08915v2)
  - Claude Code study of 567 PRs: **83.8%** eventually accepted; just over half of merged PRs (~54.9%) were integrated without further human modification. — [On the Use of Agentic Coding (ResearchGate)](https://www.researchgate.net/publication/401662159_On_the_Use_of_Agentic_Coding_An_Empirical_Study_of_Pull_Requests_on_GitHub)
  - Failure analysis and "meaningful PR" studies also exist. — [arXiv 2601.15195](https://arxiv.org/html/2601.15195); [arXiv 2601.18749](https://arxiv.org/html/2601.18749)
  - Reported merge rates vary widely by dataset filter (e.g., Copilot 43%-68% across studies).
- **[INCIDENT/Policy]** Amazon (FT, Mar 2026): senior sign-off is mandatory for AI-assisted changes by junior and mid-level engineers. — [OfficeChai](https://officechai.com/ai/amazon-requires-senior-engineers-to-sign-off-on-ai-assisted-changes-made-by-junior-and-mid-level-engineers-after-ai-related-outage/)
- **AI code review market traction:**
  - **CodeRabbit:** ~$143M Series C at a **$1.5B valuation** (Aug 2026). The company reports **2M+ code reviews per week**, **17,000+ customers** and **>5x YoY** revenue growth. Sacra estimates **~$50M ARR (July 2026)**, up from $25M at end-2025; the prior round was a $60M Series B (Sept 2025) at ~$550M. — [TechFundingNews](https://techfundingnews.com/coderabbit-lands-143m-at-1-5b-valuation-as-ai-generated-code-surges/); [PYMNTS](https://www.pymnts.com/news/artificial-intelligence/2026/coderabbit-raises-143-million-at-1-5-billion-valuation-to-govern-ai-generated-code/); [Sacra](https://sacra.com/c/coderabbit/)
  - **Cursor acquired Graphite (19 Dec 2025):** Graphite is a code-review/stacked-PR platform; Axios reported a price "way over" its last $290M valuation (from a $52M Series B in 2025). — [TechCrunch](https://techcrunch.com/2025/12/19/cursor-continues-acquisition-spree-with-graphite-deal); [Axios](https://www.axios.com/pro/enterprise-software-deals/2025/12/19/cursor-buys-code-review-platform-graphite)
- **How humans cope with large agent diffs:**
  - **Stacking** (breaking work into small dependent PRs), via Graphite and GitHub's 2026 stacked PRs. — [TechCrunch](https://techcrunch.com/2025/12/19/cursor-continues-acquisition-spree-with-graphite-deal); [Octoverse 2026](https://github.blog/2026-10-28-octoverse-commits-pushes-reach-new-highs-in-2026-as-developers-build-with-agents/)
  - **Seniority gating** (Amazon).
  - **AI first-pass review** (CodeRabbit-style).
  - **Deferring review**, i.e., queueing (LinearB).
- **[Position paper][PREPRINT] Monperrus, "The End of Code Review: Coding Agents Supersede Human Inspection" (11 June 2026):** argues agents can meet every goal of code review more cheaply, and that "agents write / humans must review" is a "dead end" that neither provides meaningful assurance nor scales. It is an argument, with no empirical data in the abstract. — [arXiv 2606.13175](https://arxiv.org/abs/2606.13175)

### Inferences
- The numbers show human review capacity has not scaled with generation: PRs ~3x in two years, agent share 17%→40%+ in six months, review time +49% to +91% (possibly +441%). Something must give: more automation (AI review, agent-verifies-agent), less review (rubber-stamping), or better human tooling per review minute.
- Agent PRs reaching merge-rate parity (90% vs 86%) could mean agents are good enough, or that reviewers are rubber-stamping under volume pressure. Faros explicitly cannot rule out shallower review. Either reading implies humans are understanding a shrinking share of merged code.
- The money in this category flows to tools embedded in the PR workflow (CodeRabbit, Graphite, GitHub-native review). A standalone understanding tool must either plug into that workflow or serve a different moment (onboarding, architecture oversight, incident response, non-developers).

### Gaps
- Greptile's funding (a reported $25M Series A in fall 2025) appeared only in a secondary comparison table and was not verified.
- No rigorous study was found on *how reviewers actually read* very large agent diffs (eye-tracking, time-per-line), or on the defect-escape rate of rubber-stamped agent PRs.
- LinearB and Faros 2026 primaries were not opened.

## 6. Developer trust in AI output (Stack Overflow, DORA, JetBrains)

### Takeaway
Usage is near saturation (83-90%), but trust is low and conditional. In 2025 more developers distrusted than trusted AI accuracy, and by 2026 trust is framed as "only when I can verify it". Verification is the precondition for trust, and source attribution is in strong demand.

### Cited Findings
- **[SURVEY] Stack Overflow Developer Survey 2025 (July 2025):**
  - **84%** use or plan to use AI (up from 76%), and **50.6%** of professionals use it daily.
  - Trust in AI accuracy: **highly trust 3.1%, somewhat trust 29.6%, somewhat distrust 26.1%, highly distrust 19.6%**, so about 33% trust vs about 46% distrust.
  - Experienced developers: lowest "highly trust" (2.5%) and highest "highly distrust" (20.7%).
  - Favourability is **59.7%** (vs "70%+" in 2023-24).
  - Top frustrations: **66%** "almost right, but not quite"; **45.2%** "debugging AI-generated code is more time-consuming".
  - AI agents: **14.1%** use daily at work, **37.9%** don't plan to use them.
  
  — [Stack Overflow 2025 AI section](https://survey.stackoverflow.co/2025/ai)
- **[SURVEY] Stack Overflow Developer Survey 2026 (released 6 Oct 2026, 30,903 responses, 169 countries):**
  - **82.8%** use AI tools; **66%** use coding assistants/agents; **26.2%** use automated agent workflows.
  - About **half (~48%)** trust AI output **when they can easily verify it**; only **6.6%** trust it for many tasks including important decisions.
  - **78.7%** say **source attribution** is important or very important when evaluating AI-generated code.
  - Stack Overflow says that in earlier surveys usage rose for three years while trust fell.
  
  — [Stack Overflow press release](https://stackoverflow.co/company/press/archive/stack-overflow-annual-developer-survey-ai-trust-conditional); [The Register, 10 Oct 2026](https://www.theregister.com/software/2026/10/10/stack-overflow-survey-finds-devs-hooked-on-ai-but-not-totally-sold-on-its-judgment/5301662)
- **[SURVEY] DORA 2025:** **30%** trust AI output "a little" (23%) or "not at all" (7%); **24%** trust it "a great deal" (4%) or "a lot" (20%). DORA calls this "trust but verify". — [Google blog](https://blog.google/innovation-and-ai/technology/developers-tools/dora-report-2025/)
- **[SURVEY] JetBrains State of Developer Ecosystem 2025 (Apr-Jun 2025, 24,534 developers, published Oct 2025):**
  - **~85%** regularly use AI; only ~15% have never used AI for work.
  - Top concerns: **code quality (23%)**, **AI's limited understanding of complex code and logic (18%)**, privacy/security (13%), impact on own skills, and lack of context awareness.
  
  — [JetBrains Research](https://blog.jetbrains.com/research/2025/10/state-of-developer-ecosystem-2025/); [The Register](https://www.theregister.com/2025/10/21/massive_jetbrains_dev_survey); [Le Monde Informatique](https://www.lemondeinformatique.fr/actualites/lire-85-des-developpeurs-utilisent-regulierement-l-ia-98280.html)

### Inferences
- "I trust it when I can verify it" (~48%) together with strong demand for source attribution (78.7%) describes demand for *verification affordances*: grounded claims traceable to code, rather than more fluent AI prose.
- Trust is lowest among experienced developers, the people who must sign off on AI changes (e.g., Amazon). Tools that let seniors verify faster target the scarcest resource.

### Gaps
- The 2026 Stack Overflow accuracy trust/distrust split was not available in the press release. Figures circulating online ("29% trust, 46% distrust") appear to be 2025 numbers misattributed to 2026.
- JetBrains 2026 survey results were not found.

## 7. Vibe coding and non-developer builders

### Takeaway
App builders for non-developers grew at historic speed (Lovable reportedly >$500M ARR by mid-2026). Their documented failures are overwhelmingly about **builders not understanding what they shipped**: public-by-default data, missing row-level security, exposed keys, dev/prod not separated. These are architecture and configuration problems that are visible at the system level, not in individual lines of code.

### Cited Findings
- **[SECONDARY] Growth (company-reported or third-party; figures vary):**
  - **Lovable:** **>$500M annualized revenue as of June 2026** and a **$13.3B valuation**. — [ValueAdd VC](https://valueaddvc.com/blog/lovable-valuation-2026-13-2b-and-500m-arr-how-vibe-coding-actually-makes-money); [Wikipedia: Lovable](https://en.wikipedia.org/wiki/Lovable_(company))
  - Lovable had **~8M users (Nov 2025)**. — [DemandSage](https://www.demandsage.com/lovable-statistics/)
  - **Replit:** reportedly a **$9B valuation (Mar 2026)**, with ARR estimates from ~$265M (end-2025) to ~$525M (Apr 2026). — [AgentMarketCap](https://agentmarketcap.ai/blog/2026/04/13/agentic-web-development-platforms-bolt-replit-lovable-vs-coding-agents-2026)
  - **Bolt.new:** **$40M ARR within five months** of launch. — [Luminix landscape](https://www.useluminix.com/reports/industry-analysis/vibe-coding-tool-landscape-replit-v0-base44-bolt-lovable-vercel)
- **[SURVEY]** Stack Overflow 2025: only **15.1%** of developers say vibe coding is part of their work and **72.2%** say no. Vibe coding is mainly a non-professional and prototyping phenomenon. — [Stack Overflow 2025](https://survey.stackoverflow.co/2025/ai)
- **[OBS-L]** GitHub reports **225M+ developers** (Octoverse 2026); the US and India each added >10M in a year. — [GitHub Octoverse 2026](https://github.blog/2026-10-28-octoverse-commits-pushes-reach-new-highs-in-2026-as-developers-build-with-agents/)
- **[INCIDENT] Lovable CVE-2025-48757 (May 2025):** missing row-level security exposed data in **170 of 1,645** scanned Lovable-built apps. Lovable disputed the CVE. — [Wikipedia: Lovable](https://en.wikipedia.org/wiki/Lovable_(company)); [vibe-coding security tracker](https://pranava0x0.github.io/vibe-coding-security/advisories/ongoing-vibe-platform-exposure.html)
- **[INCIDENT] Lovable Feb-Apr 2026:**
  - A researcher (Taimur Khan) reported that other users' project data was readable. Lovable said there was no breach and called it "intentional behaviour" tied to public-visibility settings.
  - A reported **BOLA** issue left pre-Nov-2025 projects' code and chat history readable by anyone with a link from Feb to Apr 2026.
  - One tracker cites **18,697 user records** (4,538 student accounts) exposed from a Lovable-built EdTech app.
  
  — [vibe-coding security tracker](https://pranava0x0.github.io/vibe-coding-security/advisories/ongoing-vibe-platform-exposure.html); [State of Surveillance](https://stateofsurveillance.org/news/lovable-data-breach-vibe-coding-source-code-credentials-exposed-2026/)
- **[OBS] RedAccess scan, reported by Axios 7 May 2026:** **~380,000 publicly accessible assets** built with Lovable, Base44, Replit and Netlify, about **5,000 containing sensitive corporate data**. Privacy settings on some tools **defaulted to public**, and phishing sites impersonating brands were also built on Lovable. — [Axios](https://www.axios.com/2026/05/07/loveable-replit-vibe-coding-privacy); [vibegraveyard summary](https://vibegraveyard.ai/story/redaccess-vibe-coded-apps-380k-data-exposure-study/)
- **[INCIDENT]** Moltbook (early 2026): a vibe-coded platform with a misconfigured database exposed a large number of records. The Replit/SaaStr database deletion (July 2025) is the canonical agent-destroys-prod case. — [Unimon compilation](https://unimon.co.th/en/blog/vibe-coding-failure-cases-lessons)

### Inferences
- Non-developer builders cannot use code review as a safety mechanism, because they cannot read code. Their failures sit at the level of data flow, access control, environment and permissions, which a *visual system map* can express without requiring code literacy.
- The vibe-coding user base is large, fast-growing and monetizable (hundreds of millions in ARR). A "do you understand what you built, and is it safe?" layer for these users is a plausible adjacent market.

### Gaps
- No data on v0's revenue or user counts was found.
- An aggregator claim that AI-coding web traffic fell 76% over 12 weeks (Lovable from +207% to −37% growth) could not be corroborated, and it conflicts with the revenue reports.
- No systematic study was found of how often non-developer-built apps are abandoned because the builder could not maintain or extend them, a key unmeasured "comprehension debt" cost for this segment.

## 8. Counter-evidence: AI improves understanding, or comprehension won't matter

### Takeaway
There is real counter-evidence.
- Newer models appear to speed up even expert developers.
- Agent PRs now merge at parity with human PRs.
- AI used as an explainer can *preserve or improve* learning.
- A credible strand of thinking argues agents will verify agents, making human comprehension optional.

But the most rigorous comprehension studies still show no automatic benefit from AI explanations, and incidents show accountability still lands on humans.

### Cited Findings
- **Speed-up is real and growing:** METR now believes developers are likely faster with current tools, and its progress report cites "material acceleration". — [METR](https://metr.org/blog/2026-02-24-uplift-update/); [METR progress report](https://metr.org/february-2026-progress-report.pdf)
- **Field RCTs:** Cui et al. found **~26%** more completed tasks. — [SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4945566)
- **Google RCT:** **~21%** faster. — [arXiv 2410.12944](https://arxiv.org/abs/2410.12944)
- **Throughput is now positive in DORA 2025.** — [Google Cloud](https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-2025-dora-report)
- **Agent PRs reach merge parity:** within-two-weeks merge rate **90% vs ~86%** for non-agent PRs (Sept 2026). — [GitHub Octoverse 2026](https://github.blog/2026-10-28-octoverse-commits-pushes-reach-new-highs-in-2026-as-developers-build-with-agents/)
- **AI as a comprehension scaffold:**
  - In Anthropic's RCT, conceptual/explanatory AI use was associated with better retention than delegation. — [Anthropic](https://www.anthropic.com/research/AI-assistance-coding-skills)
  - The EASE 2026 diary study found students using GenAI as a "comprehension scaffold" built deeper understanding. — [arXiv 2604.13277](https://arxiv.org/abs/2604.13277)
  - In "Faster but Not Wiser", identifying *what and where to modify* trended positively with Copilot use (ρ = 0.50, not significant after correction). — [arXiv 2511.02922](https://arxiv.org/abs/2511.02922)
- **Weaker, mixed evidence on explanations:** 2025 studies report LLM-generated fault explanations help novices, and code summaries help comprehension of unfamiliar code. These are mostly small or student samples, and individual papers were not verified in this session. Meanwhile, the stronger 86-programmer study found **no** benefit from NL explanations and **more overconfidence**. — [arXiv 2607.08885](https://arxiv.org/html/2607.08885v1)
- **"Comprehension won't matter" position:** Monperrus (June 2026) argues coding agents supersede human inspection and that human-mandatory review "neither provides meaningful assurance nor scales". — [arXiv 2606.13175](https://arxiv.org/abs/2606.13175)
- **Practitioner behaviour already reflects this:** teams hand bugs back to the AI instead of understanding them. — [arXiv 2607.10856](https://arxiv.org/pdf/2607.10856)
- **Against the "AI review fixes it" view:** 80% of firms use AI review, but it produced only 23% of comments and did not remove the bottleneck (Harvard). — [ComplexDiscovery](https://complexdiscovery.com/harvard-researchers-find-ai-coding-agents-shifted-the-bottleneck-to-code-review/)
- **Against "AI caused it":** Amazon attributes its Kiro incidents to "user error, not AI error" (excess permissions). That frames the problem as guardrails and permissions rather than comprehension. — [OfficeChai](https://officechai.com/ai/amazon-requires-senior-engineers-to-sign-off-on-ai-assisted-changes-made-by-junior-and-mid-level-engineers-after-ai-related-outage/)

### Inferences
- The strongest argument against the hypothesis is *agent-verifies-agent*: if automated verification (tests, formal checks, AI review) becomes reliable, line-level human comprehension becomes optional, like reading compiler output. As of Nov 2026 that is a position, not a demonstrated result. Field data shows humans still gate merges, organisations are adding human sign-off (Amazon), and AI review has not cleared the queue.
- Even in an agent-verifies-agent world, someone must decide *what* the system should do, set permissions, and answer for incidents. Demand may shift from "understand every line" to "understand and govern the system": architecture, data flows, blast radius, and intent vs. implementation.

### Gaps
- No rigorous study shows that understanding-at-a-distance (e.g., diagrams or architecture summaries) reduces defect escape or incident rates for AI-generated code. This is unproven in both directions.
- No data was found on whether agents can maintain their own codebases over long horizons without human comprehension (e.g., multi-month agent-maintained repos with outcome metrics).

## Implications for Rassam

- **The bottleneck has moved to verification, and it is measured, not hypothetical.** Review time is up 49-91% (Harvard, Faros) and agent PRs wait ~5x longer for pickup (LinearB), while PR volume has tripled and >40% of PRs are agent-started (GitHub 2026). The hypothesis is supported, but demand centres on understanding *changes* (what did this agent/PR do to the system, and what could it break) more than whole-repo explainers. Rassam's repo-to-flowchart core is closer to a strong fit if it becomes **diff-aware**: architecture before vs after, highlighted blast radius, cross-module edges the change introduced.
- **Prioritise verifiable, grounded output over AI prose.** NL explanations did not help expert reviewers and low-quality ones increased overconfidence (86-programmer study). Developers trust AI mainly "when they can verify it" (~48%) and want source attribution (78.7%). Every node, edge and claim on the canvas should link to exact files and lines, and the product should support *active verification* rather than passive reading: predict-the-effect prompts, "show me the evidence", checklists. The "Faster but Not Wiser" verification loops and Anthropic's conceptual-inquiry findings are the design template.
- **Don't build another PR-comment bot.** The PR-level AI review lane is crowded and well funded (CodeRabbit $1.5B with 2M+ reviews/week, Cursor+Graphite, GitHub-native AI review +90% YoY). The same field data shows it hasn't removed the human bottleneck. Rassam's differentiation is the **system-level, visual, cross-PR view** those tools lack: architecture drift over many agent PRs, a map of what humans have verified vs not, and module ownership now that git-blame authorship no longer signals understanding.
- **Non-developer builders may be the stronger market.** Lovable-class platforms have millions of users and >$500M ARR, and their failures are architectural or configuration issues a visual map can show: public DBs, missing RLS, exposed keys, prod/dev confusion. "See and safety-check what your AI built" in plain diagrams suits users who cannot read code, and could plug into Supabase/Lovable/Replit-style stacks.
- **Make reviewers' time count.** Organisations are institutionalising human gates (Amazon senior sign-off), and experienced developers are the most distrustful. A product that cuts the time for a senior engineer to confidently approve an AI-generated change (architecture-level summary, risk hotspots, linked evidence) targets the scarcest resource in the 2026 pipeline.
- **Hedge against "agents verify agents".** If automated verification matures (the Monperrus position, merge-rate parity), line-level human review shrinks, but humans still own intent, permissions and accountability. Position the canvas as the **shared, machine-readable system model**: a spec and contract that agents read and update and that humans govern, audit and use in incident postmortems. Rassam's existing Canvas Sync snapshot and agent write tools are a seed of this "human oversight interface for agent-built systems", which stays relevant even if line-level comprehension stops mattering.
- **Treat comprehension debt as a team-level metric, not just a feeling.** Research defines it as a team-cognition gap, and authorship-based knowledge metrics are breaking. An explicit "understood/verified" layer over the architecture (which parts a human has reviewed, when, and against which code version) is a novel, defensible feature with no clear incumbent in the evidence reviewed.
