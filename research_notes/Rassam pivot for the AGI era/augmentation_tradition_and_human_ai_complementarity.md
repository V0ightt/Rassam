# The Augmentation Tradition and Human-AI Complementarity: Foundations, Evidence, and Interface Properties

Research notes, compiled 2026-11-19. Scope: (a) the intelligence-augmentation (IA) tradition as it applies to visual/spatial tools for understanding complex systems, (b) empirical evidence on human-AI team performance, automation bias, over-reliance, (c) external cognition / diagram research, (d) 2023-2026 HCI work on non-chat (canvas, direct-manipulation, graph) LLM interfaces.

Labels used below: **[EMPIRICAL]** = measured result from a study; **[VISION]** = philosophy, design argument, or essay; **[NOT RE-VERIFIED]** = drawn from the primary text as known to the researcher but not re-fetched in this session (the session's web-search budget ran out before every item could be checked). Treat [NOT RE-VERIFIED] items as needing a spot check before quoting.

---

## 1. Foundations: what the augmentation tradition says tools for thought should do

### Takeaway
The tradition is consistent on one point: the aim is to change how people represent and manipulate a problem (Engelbart's "augmentation means", Carter & Nielsen's "cognitive transformation", Victor's moving up and down the abstraction ladder), not to hand the problem to an oracle. The principles that recur across sources can be acted on directly: externalize structure spatially, make transformations between views fast, link the abstract to the concrete, let users reshape their own tools, and treat the human as goal-setter and evaluator. All of this is vision, not measured evidence.

### Cited Findings

**Vannevar Bush, "As We May Think" (The Atlantic, July 1945) [VISION]**
- Bush proposed the memex, a desk-sized device that stores a person's records. Its key operation is "associative indexing": any item can be tied to another, the way the mind works by association, instead of being filed in a hierarchical index. A user builds named "trails" through material, adds comments, and can copy a trail and give it to a colleague. Bush predicted a new profession of "trail blazers" who would find value in building useful trails through the common record. [NOT RE-VERIFIED] — [The Atlantic, 1945](https://www.theatlantic.com/magazine/archive/1945/07/as-we-may-think/303881/)
- Principle you can act on: the lasting, shareable thing a person contributes is a curated path through a large body of material (with their annotations), not the raw material itself. In Bush's design, trails are first-class objects that can be shared. [VISION]

**J.C.R. Licklider, "Man-Computer Symbiosis" (IRE Trans. Human Factors in Electronics, March 1960) [VISION + informal self-observation]**
- Licklider's division of labor: humans will "set the goals, formulate the hypotheses, determine the criteria, and perform the evaluations." Humans also supply motivation, ask questions, propose models, and handle very-low-probability situations. Computers turn hypotheses into testable models, run simulations, transform and plot data, and do routine clerical work between decisions — [Licklider 1960 (MIT CSAIL mirror)](https://groups.csail.mit.edu/medg/people/psz/Licklider.html)
- In an informal self-study, about 85% of what Licklider counted as "thinking" time went to getting into a position to think: finding information, plotting graphs, converting data. Only a small share went to reasoning — [Licklider 1960](https://groups.csail.mit.edu/medg/people/psz/Licklider.html)
- He explicitly treated symbiosis as an *interim* period: he expected about 5 years to develop it and about 15 years to use it, before machines might dominate thinking — [Licklider 1960](https://groups.csail.mit.edu/medg/people/psz/Licklider.html)
- Among his requirements for symbiosis is a "desk-surface display and control" where human and computer draw, write, and edit together, plus wall displays shared by a team. This is an early call for a shared graphical workspace rather than a sequential teletype dialogue — [Licklider 1960](https://groups.csail.mit.edu/medg/people/psz/Licklider.html)

**Douglas Engelbart, "Augmenting Human Intellect: A Conceptual Framework" (SRI report, October 1962) [VISION]**
- Engelbart defines augmentation as increasing a person's capability "to approach a complex problem situation," to gain comprehension, and to derive solutions — [Engelbart 1962, Doug Engelbart Institute](https://www.dougengelbart.org/content/view/138)
- H-LAM/T: a "Human using Language, Artifacts, Methodology, in which he is Trained." The human and the augmentation means form one system to be improved together. Changing an artifact without changing language, method, and training gives limited gains — [Engelbart 1962](https://www.dougengelbart.org/content/view/138)
- Regenerative cycle: better symbol manipulation enables better concept structuring, which in turn enables more powerful symbol manipulation. Change in one capability spreads up and down the capability hierarchy. The report advises pursuing the quickest gains first and using them to reach later ones. The 1962 text reached in this session does not use the word "bootstrapping", which Engelbart used later — [Engelbart 1962](https://www.dougengelbart.org/content/view/138)
- Key capability: "the speed and flexibility with which one form can be transformed into another". Computer-generated "views" pull out and order the statements that bear on a given point. Working notes grow into "an evermore-detailed, interlinked structure" (the architect example) — [Engelbart 1962](https://www.dougengelbart.org/content/view/138)
- Augmentation is "a way of life in an integrated domain" where hunches, trial and error, intangibles, and the human "feel for a situation" co-exist with powerful concepts and electronic aids — [Engelbart 1962](https://www.dougengelbart.org/content/view/138)

**Alan Kay / Dynamicland lineage [VISION]**
- Bret Victor's research on dynamic media for understanding systems produced the talks "Inventing on Principle" and "Media for Thinking the Unthinkable". He co-founded the CDG research lab with Alan Kay; it later became HARC, then Dynamicland (Oakland) — [Bret Victor CV](https://worrydream.com/cv/); [Dynamicland about](https://dynamicland.org/about-us/)
- Kay's own primary texts (Dynabook, 1972; Kay & Goldberg "Personal Dynamic Media", 1977, on the computer as a "metamedium") could not be verified this session. See Gaps.

**Bret Victor, "Up and Down the Ladder of Abstraction" (October 2011) and "Media for Thinking the Unthinkable" (2013) [VISION]**
- Thesis: you understand a system you cannot yet predict by moving between levels of abstraction. Staying concrete hides patterns, and staying abstract makes them hard to explain. Insight comes from "the transitions between them" — [Victor 2011](https://worrydream.com/LadderOfAbstraction/)
- Design moves:
  - Make time, parameters, and inputs interactively controllable ("control before abstracting").
  - Step up by showing behavior across all values of a variable.
  - Step down by picking a concrete instance out of an abstraction.
  - Use multiple linked representations and metrics.
  - Iterate one change at a time.
  - Build your own tools.
  - Visual abstraction complements symbolic abstraction.
  — [Victor 2011](https://worrydream.com/LadderOfAbstraction/)
- Victor says "Media for Thinking the Unthinkable" covers the same theme as the Ladder essay: representations for thinking about *systems* — [Victor, note on the talk](https://worrydream.com/MediaForThinkingTheUnthinkable/note.html); [talk page](https://worrydream.com/MediaForThinkingTheUnthinkable/)

**Shan Carter & Michael Nielsen, "Using Artificial Intelligence to Augment Human Intelligence" (Distill, December 2017) [VISION + prototype]**
- The essay names "artificial intelligence augmentation" (AIA): using AI systems to build new methods of intelligence augmentation — [Distill 2017](https://distill.pub/2017/aia/)
- Two models of what computers are for:
  - **cognitive outsourcing**: the computer as an oracle that solves problems for us. The authors call this incomplete.
  - **cognitive transformation**: "changing the operations and representations we use to think."
  — [Distill 2017](https://distill.pub/2017/aia/)
- Font-model example: a generative model learns a latent space of fonts. The interface exposes meaningful high-level operations (for example, a "bolding" direction), so the model's learned structure becomes a new primitive that users can think with — [Distill 2017](https://distill.pub/2017/aia/)
- Users *internalize* an interface's operations. The best interfaces reveal deep principles of the domain, so that working with them updates the user's own understanding. Interfaces built only from familiar, clichéd elements change little — [Distill 2017](https://distill.pub/2017/aia/)

**Andy Matuschak & Michael Nielsen, "How can we develop transformative tools for thought?" (October 2019) [VISION + small informal data]**
- Thesis: computers have not yet transformed thought the way language and writing did. A new "medium for thought" is achievable but held back by economics: tools are costly to build and easy to copy (a public-goods problem), and tech has a "pop culture, not a research culture". The authors call for "insight-through-making" — [Matuschak & Nielsen 2019](https://numinous.productions/ttft/)
- Mnemonic medium (Quantum Country, 112 embedded cards):
  - Demonstrated retention per card rose from about 2 days after one review to about 54 days after six, at about 95 minutes of review against a 4-hour read.
  - In a small informal comparison (n = 16 vs 25), accuracy rose from 89% to 96% with regular review and fell from 91% to 87% with delayed review. The authors call this "small-but-promising".
  — [Matuschak & Nielsen 2019](https://numinous.productions/ttft/)
- They argue against the view that one can "just look stuff up", because understanding depends on internalized fundamentals. They also warn that memory tools can become crutches — [Matuschak & Nielsen 2019](https://numinous.productions/ttft/)

**Ink & Switch, "Malleable Software: Restoring User Agency in a World of Locked-Down Apps" (Litt, Horowitz, van Hardenberg, Matthews; June 2025) [VISION]**
- Thesis: personal computing delivered sealed appliances, and "Computerizing work led to a loss of agency." Malleable software lets "anyone ... adapt their tools to their needs with minimal friction", at the point of use — [Ink & Switch 2025](https://www.inkandswitch.com/essay/malleable-software/)
- Principles:
  - A gentle slope from user to creator, starting with direct manipulation and adding programmability.
  - Tools, not apps ("Apps are avocado slicers"; "a knife is a general tool").
  - Shared data substrates instead of silos (citing their local-first work with Automerge and Cambria).
  - Composable interfaces and compound documents.
  - Communal and situated creation.
  - Dynamic documents.
  — [Ink & Switch 2025](https://www.inkandswitch.com/essay/malleable-software/)
- On AI: LLM code generation makes building software more accessible but does not solve malleability by itself. Users still need ways to tweak, compose, and make precise changes without AI. The authors compare AI coding in today's app ecosystem to a skilled chef working in a food court. Inside a malleable environment, AI-built tools gain persistence and collaboration from the platform — [Ink & Switch 2025](https://www.inkandswitch.com/essay/malleable-software/)
- Ink & Switch's earlier "local-first software" essay (Kleppmann et al., 2019) argues that users should own their data, work offline, and collaborate through CRDTs. [NOT RE-VERIFIED] — [Ink & Switch local-first](https://www.inkandswitch.com/local-first/)

**Amelia Wattenberger and Maggie Appleton on interfaces beyond chat (2023) [VISION]**
- Wattenberger, "Why Chatbots Are Not the Future" (2023): a bare text box has "unclear affordances" and puts the burden of discovering capability on the user. "Good tools make it clear how they should be used" — and how they should not be used — [Wattenberger 2023](https://wattenberger.com/thoughts/boo-chatbots); discussed by [Simon Willison, 15 May 2023](https://simonwillison.net/2023/May/15/why-chatbots-are-not-the-future)
- Appleton (then at Ought/Elicit) called chatbots "the lazy solution". Her Language Model Sketchbook explores alternatives such as "Branches" (exploring cause-and-effect chains), "Epi" (a reasoning assistant), and "writing daemons" (configurable feedback personas). Reported via secondary coverage — [Smashing Magazine, Feb 2024](https://smashingmagazine.com/2024/02/designing-ai-beyond-conversational-interfaces)

### Inferences
- Rassam's own lineage — a spatial, linked, editable map of a complex system — fits squarely within Bush (trails), Licklider (a shared drawing surface), Engelbart (fast transformation between views, an interlinked structure), and Victor (moving between abstract and concrete). The tradition would judge Rassam by whether using it changes the user's mental model of the system, not by how good its diagrams look.
- Carter & Nielsen's split between outsourcing and transformation is the cleanest frame for a pivot. An "AI draws your architecture" product is outsourcing, and it gets commoditized as models improve. A product that makes the system's deep structure into manipulable primitives (call flows, data ownership, invariants, change impact) is transformation.
- Licklider framed symbiosis as an interim stage before machines dominate thinking. The founders of the tradition expected the human role to move toward goals, criteria, and evaluation, which is the pressure Rassam faces from 2027 to 2030.

### Gaps
- Alan Kay's primary texts ("A Personal Computer for Children of All Ages" 1972; Kay & Goldberg 1977 "Personal Dynamic Media", on the computer as metamedium) were not fetched. The search budget was exhausted. Treat claims about Kay as unverified apart from his co-founding of CDG with Victor.
- Feynman's "What I cannot create, I do not understand." is widely reported as written on his Caltech blackboard at his death (February 1988). The primary Caltech Archives record was not located this session, so it should be verified before citing. Its design relevance (learning by reconstructing) is discussed under Q3.
- Dynamicland's specific design principles (for example, the shared physical room and "the whole system visible") and Victor's "Humane Representation of Thought" (2014; [dynamicland.org page](https://dynamicland.org/2014/The_Humane_Representation_of_Thought/)) were found but not read in full.
- Maggie Appleton's and Amelia Wattenberger's later work (for example, Wattenberger at GitHub Next on spatial and agent interfaces) was not reviewed.

---

## 2. Human-AI complementarity: when do teams beat AI alone? (team performance, automation bias, over-reliance)

### Takeaway
The best quantitative evidence (Vaccaro, Almaatouq & Malone 2024, a meta-analysis of 370 effect sizes) finds that human-AI combinations on average perform *worse* than the better of human or AI alone (g = −0.23). When AI alone is better than humans, the combination is clearly worse than the AI (g = −0.54), even though it still beats humans alone. Synergy shows up mainly when humans are the stronger partner (g = +0.46) and, more weakly, in creation tasks (g = +0.19, not significant). Clinical, radiology, consulting, and coding studies repeat the pattern: people do not use AI input optimally. Explanations raise acceptance of AI advice whether or not it is correct. Automation bias affects experts and does not go away with training.

### Cited Findings

**Meta-analysis — Vaccaro, Almaatouq & Malone, "When combinations of humans and AI are useful", *Nature Human Behaviour* 8, 2293–2303 (published online October 2024; issue December 2024) [EMPIRICAL]**
- Scope: 74 papers, 106 experiments, and 370 effect sizes, published January 2020 to June 2023 — [arXiv v2 full text](https://arxiv.org/html/2405.06087v2); [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11659167/); [RePEc record](https://ideas.repec.org/a/nat/nathum/v8y2024i12d10.1038_s41562-024-02024-1.html)
- **Synergy** (human-AI vs the best of human or AI alone): g = −0.23 (95% CI −0.39 to −0.07). On average there is no synergy, only loss — [arXiv v2](https://arxiv.org/html/2405.06087v2)
- **Augmentation** (human-AI vs human alone): g = +0.64 (95% CI 0.53 to 0.74). AI does help people, just not past the AI's own level — [arXiv v2](https://arxiv.org/html/2405.06087v2)
- **Task type** moderated synergy (F(1,104) = 7.84, p = 0.006):
  - Decision tasks: g = −0.27 (95% CI −0.44 to −0.10).
  - Creation tasks: g = +0.19 (95% CI −0.09 to 0.48; not significant on its own, n = 34).
  — [arXiv v2](https://arxiv.org/html/2405.06087v2)
- **Relative capability** was the strongest moderator (F = 81.79):
  - When humans alone beat AI alone, synergy g = +0.46 (95% CI 0.28 to 0.66).
  - When AI alone beat humans, synergy g = −0.54 (95% CI −0.71 to −0.37), while augmentation over humans was g = +0.74.
  — [arXiv v2](https://arxiv.org/html/2405.06087v2)
- AI **explanations** and **confidence displays** were *not* significant moderators of synergy — [arXiv v2](https://arxiv.org/html/2405.06087v2)
- The authors recommend:
  - Focus on generative AI for creation tasks.
  - Design processes that divide subtasks so each partner does what it does best. Only 3 experiments tested pre-set delegation (g = 0.22, not significant).
  - Use metrics that include time, cost, and error consequences.
  - De-emphasize explanation and confidence research in favor of baseline performance, task type, and division of labor.
  — [arXiv v2](https://arxiv.org/html/2405.06087v2)
- Follow-ups (not read): a 2026 arXiv paper on "tight bounds with impossibility guarantees" for when human-AI teams can outperform individuals ([arXiv 2605.08710](https://arxiv.org/pdf/2605.08710)), and a July 2026 paper on "Rapid Crossings, a Jagged Frontier, and the Repositioning of Human Judgment" ([arXiv 2607.12125](https://arxiv.org/pdf/2607.12125)). They are listed as leads only.

**Medicine — Goh et al., "Large Language Model Influence on Diagnostic Reasoning: A Randomized Clinical Trial", *JAMA Network Open* 7(10): e2440969 (28 October 2024) [EMPIRICAL]**
- Design: single-blind RCT run November–December 2023 with 50 physicians (26 attendings, 24 residents), 25 per arm, up to 6 vignettes in 60 minutes, GPT-4 vs conventional resources — [JAMA Netw Open](https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2825395)
- Diagnostic reasoning score (median per case):
  - Physicians + LLM: 76%.
  - Physicians + conventional resources: 74% (difference 2 pp, 95% CI −4 to 8, P = .60).
  - **LLM alone: 92%**, which is 16 pp above the conventional-resources group (95% CI 2 to 30, P = .03; exploratory).
  — [JAMA Netw Open](https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2825395)
- Time per case: 519 s with the LLM vs 565 s without (adjusted difference −82 s, not significant) — [JAMA Netw Open](https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2825395)
- The authors conclude that HCI development and workforce training are needed. They still caution against autonomous LLM diagnosis without physician oversight — [JAMA Netw Open](https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2825395)

**Radiology — Agarwal, Moehring, Rajpurkar & Salz, "Combining Human Expertise with Artificial Intelligence: Experimental Evidence from Radiology", NBER WP 31422 (July 2023; revised November 2025) [EMPIRICAL]**
- 227 professional radiologists, recruited through teleradiology firms, diagnosed retrospective cases. Earlier versions reported a different sample size, so check the current version. AI predictions did **not** improve average performance, while added *contextual information* did — [NBER w31422](https://www.nber.org/papers/w31422)
- Mechanism: belief-updating errors. Radiologists underweight the AI relative to their own signal and ignore the correlation between their information and the AI's. Unless these errors can be corrected, the optimal design delegates each case to humans *or* to AI, and rarely to AI-assisted humans — [NBER w31422](https://www.nber.org/papers/w31422)
- Yu et al. (*Nature Medicine*, 2024) tested 140 radiologists on 15 chest X-ray tasks and found large variation across radiologists in how much AI assistance helped — [Nature Medicine 2024](https://www.nature.com/articles/s41591-024-02850-w.pdf)
- Note the contrast: radiologists *under*-relied (algorithm aversion), while the explanation studies below show *over*-reliance. Mis-calibration runs in both directions.

**Consulting — Dell'Acqua et al., "Navigating the Jagged Technological Frontier" (HBS WP 24-013 / SSRN, September 2023) [EMPIRICAL]**
- Preregistered field experiment with 758 BCG consultants, randomized to work with or without GPT-4 on realistic tasks — [SSRN](https://papers.ssrn.com/abstract=4573321); [MIT Sloan PDF](https://mitsloan.mit.edu/sites/default/files/2023-10/SSRN-id4573321.pdf)
- On a task chosen to lie *outside* the AI's capability frontier, consultants using AI were 19 points less likely to reach the correct solution than those without AI. The Harvard Crimson reported this as "19 percent", and the research tool could not confirm whether the paper says "percentage points"; check the abstract — [Harvard Crimson, Oct 2023](https://thecrimson.com/article/2023/10/13/jagged-edge-ai-bcg)
- Inside the frontier, the paper's abstract reports about 12% more tasks completed, about 25% faster, and about 40% higher quality. [NOT RE-VERIFIED] — [SSRN](https://papers.ssrn.com/abstract=4573321)
- The lead author attributed the outside-frontier loss to people who "switch off their brains" and follow the AI — [Harvard Crimson](https://thecrimson.com/article/2023/10/13/jagged-edge-ai-bcg)

**Software engineering — METR RCT (July 2025) [EMPIRICAL]**
- 16 experienced open-source developers completed 246 real issues on repositories they maintain. Each issue was randomized to allow or disallow AI (mainly Cursor with Claude 3.5/3.7 Sonnet). With AI allowed, they took **19% longer** — [METR blog](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/); [arXiv 2507.09089](https://arxiv.org/pdf/2507.09089)
- Perception gap: developers forecast a 24% speedup and, *after* the study, still believed AI had sped them up by about 20% — [METR](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)
- Caveats: this is a snapshot of early-2025 tools. 56% had not used Cursor before, though METR argues a learning curve does not explain the result — [TechCrunch, 11 Jul 2025](https://techcrunch.com/2025/07/11/ai-coding-tools-may-not-speed-up-every-developer-study-shows)

**Explanations increase over-reliance — Bansal et al., "Does the Whole Exceed its Parts? The Effect of AI Explanations on Complementary Team Performance" (CHI 2021) [EMPIRICAL]**
- The study used an AI with accuracy comparable to humans across three datasets. AI assistance produced some complementary gains, but explanations did **not** increase them. Explanations increased acceptance of the AI's recommendation *regardless of whether it was correct*. The authors call for new explanation methods that promote *appropriate* trust — [arXiv 2006.14779](https://arxiv.org/abs/2006.14779) (DOI 10.1145/3411764.3445717)

**Cognitive forcing functions — Buçinca, Malaya & Gajos, "To Trust or to Think" (CSCW 2021) [EMPIRICAL]**
- N = 199. Three cognitive-forcing designs were compared with two simple explainable-AI designs and a no-AI baseline. Forcing functions significantly reduced over-reliance compared with explanation-only designs, but did not eliminate it — [arXiv 2102.09692](https://arxiv.org/abs/2102.09692); [Harvard page](https://www.eecs.harvard.edu/~kgajos/papers/2021/bucinca2021trust.shtml)
- Trade-off: participants rated the designs that most reduced over-reliance as the *least* favorable, and preferred the less demanding designs with which they performed worse. Benefits concentrated among people high in Need for Cognition, which raises an equity issue — [arXiv 2102.09692](https://arxiv.org/abs/2102.09692)
- The forcing designs reportedly include asking the user to decide *before* seeing the AI's recommendation, showing the AI's output only on request, and imposing a delay. [NOT RE-VERIFIED: exact condition names] — [Buçinca et al. PDF](https://kgajos.seas.harvard.edu/papers/bucinca21trust.pdf)

**Automation bias and complacency — Parasuraman & Manzey, "Complacency and Bias in Human Use of Automation: An Attentional Integration", *Human Factors* 52(3): 381–410 (2010) [EMPIRICAL REVIEW]**
- Complacency occurs in both novice and expert operators and cannot be overcome with simple practice. Automation bias also occurs in naive and expert participants, cannot be prevented by training or instructions, and affects both individuals and teams — [PubMed 21077562](https://pubmed.ncbi.nlm.nih.gov/21077562/); [SAGE](https://journals.sagepub.com/doi/10.1177/0018720810376055)
- The authors' model treats complacency and bias as overlapping effects with attentional roots. Complacency is most likely when several tasks compete for attention — [PubMed](https://pubmed.ncbi.nlm.nih.gov/21077562/)

**Ironies of automation, then and now [EMPIRICAL REVIEW + ARGUMENT]**
- Bainbridge, "Ironies of Automation", *Automatica* 19(6), 1983. Its points [NOT RE-VERIFIED]:
  - Automation leaves operators the tasks designers could not automate, plus monitoring.
  - Humans are poor at sustained monitoring.
  - Manual and cognitive skills decay without practice, yet operators are expected to take over in exactly the hardest, abnormal situations.
  - The more advanced the automation, the more crucial the human contribution may be.
  — [DOI 10.1016/0005-1098(83)90046-8](https://doi.org/10.1016/0005-1098(83)90046-8)
- Simkute, Tankelevitch, Kewenig, Scott, Sellen & Rintel, "Ironies of Generative AI" (*IJHCI* 41(5): 2898–2919, 2024; Microsoft Research). They apply Bainbridge to GenAI and identify four sources of productivity loss:
  1. The user's role shifts from producing to *evaluating* output.
  2. Workflows are restructured unhelpfully.
  3. Interruptions.
  4. Automation makes easy tasks easier and hard tasks harder.
  Proposed mitigations drawn from human factors: continuous feedback, personalization, ecological interface design, task stabilization, and clear task allocation — [arXiv 2402.11364](https://arxiv.org/abs/2402.11364v1); [Microsoft Research](https://www.microsoft.com/en-us/research/?p=1010463)
- Lee et al., "The Impact of Generative AI on Critical Thinking" (CHI 2025; Microsoft Research/CMU). Survey of 319 knowledge workers covering 936 real GenAI use cases:
  - Higher confidence in GenAI is associated with *less* critical thinking.
  - Higher self-confidence is associated with *more* critical thinking.
  - Critical thinking shifts toward information verification, response integration, and "task stewardship".
  - Limitation: these are self-reports, not measured performance.
  — [Lee et al. PDF](https://advait.org/files/lee_2025_ai_critical_thinking_survey.pdf); [DOI record](https://api.openalex.org/works/doi:10.1145%2F3706598.3713778)

**Centaur / freestyle chess — the historical arc [mostly commentary, not controlled studies]**
- Tyler Cowen, as reported around 2013, said that as of about 2008 a human plus a computer generally beat a computer alone over a 90-minute game. Humans helped by ruling out sets of moves, comparing different programs, and probing where they disagreed — [Business Insider (India)](https://www.businessinsider.in/humans-are-on-the-verge-of-losing-one-of-their-last-big-advantages-over-computers/articleshow/25275602.cms)
- After AlphaZero (December 2017), Cowen declared "The age of the centaur is over" — [Marginal Revolution, Dec 2017](https://marginalrevolution.com/marginalrevolution/2017/12/the-age-of-the-centaur-is-over.html)
- Cowen's February 2024 follow-up says "centaur chess" is now run by computers, because engines got strong enough that human strategic input stopped making sense. Engine *diversity* (for example, Stockfish vs AlphaZero-style engines working on different principles) makes "which program to use" a live human decision again — [Marginal Revolution, Feb 2024](https://marginalrevolution.com/marginalrevolution/2024/02/centaur-chess-is-now-run-by-computers.html)
- Kasparov's 2005 freestyle anecdote: amateurs with several engines and a good *process* beat grandmasters with engines. He summarized it as "weak human + machine + better process" beating a strong computer alone and a strong human + machine with an inferior process. [NOT RE-VERIFIED; paraphrased] — [Kasparov, NYRB 2010](https://www.nybooks.com/articles/2010/02/11/the-chess-master-and-the-computer/)
- No recent controlled study measuring current human+engine vs engine-alone performance was found. See Gaps.

### Inferences
- The relative-capability result is the most important single fact for a 2027–2030 strategy. As AI becomes better than humans at a task (reading code, drawing architecture, answering "how does X work?"), putting a human in the *per-decision* loop is expected to *lower* outcome quality relative to the AI alone. The human still benefits, through augmentation, but the system gets worse. Chess played out this path from roughly 2005 to 2017.
- Value stays positive in three places: (a) subtasks where humans keep an edge (context, goals, and tacit organizational knowledge, which the radiology study's finding that *contextual information* helped supports); (b) creation tasks; and (c) explicit *division of labor*, meaning routing cases to the right agent rather than blending judgments. Agarwal et al.'s optimal-delegation conclusion and Vaccaro's recommendation point the same way.
- The interface move that sounds most obvious — explain the AI's reasoning — does not reliably help. In Bansal et al. it increased blind acceptance, and in Vaccaro et al. explanations were not a significant moderator. Interfaces that make people *think first* (cognitive forcing) do reduce over-reliance, but users dislike them.
- Users misjudge their own AI-assisted productivity (METR's perception gap). Any "it feels faster" product evidence is unreliable without measurement.

### Gaps
- The full numerical results of Bansal et al. 2021 (per-dataset accuracies and participant counts) were not extracted.
- No controlled modern data on centaur chess. The "human advantage vanished" timeline rests on commentary (Cowen, chess.com, ChessBase).
- Bainbridge 1983 and Kasparov 2010 were not re-fetched. Their content is stated from known primary texts.
- Vasconcelos et al. (CSCW 2023, "Explanations can reduce overreliance… when the cost of verification is low") and Steyvers/Kumar work on calibrated AI confidence were not reviewed. They are probably relevant to "verification cost" as a design lever.
- No study was found that measures human-AI team performance specifically on *program comprehension or architecture understanding* with diagram-based tools. This is an open opportunity.

---

## 3. What roles remain for humans when AI is better at the task?

### Takeaway
The roles are, in order of evidence strength:
1. **Learning and understanding**, where there is direct RCT evidence that delegating harms skill formation while inquiry-style use preserves it.
2. **Allocation and choosing between options**, meaning deciding who or which model handles what. Evidence comes from the delegation results, chess engine diversity, and Kasparov's "process".
3. **Supplying context and goals.** Radiology found context helped where AI predictions did not, and Licklider's division of labor puts goals with humans.
4. **Accountability for irreversible actions**, supported mostly by design argument and agent-safety practice.
5. **Sensemaking**, supported by small HCI studies.

"Setting goals/values" is mostly argued in philosophy, not measured. The monitoring role is the weakest and riskiest (Bainbridge; Parasuraman & Manzey).

### Cited Findings

**Learning and understanding (strongest empirical support)**
- Shen & Tamkin (Anthropic), "How AI Impacts Skill Formation" (RCT, published 29 January 2026), studied 52 mostly junior developers learning a new Python library:
  - The AI-assisted group scored **50%** on the follow-up comprehension quiz, vs **67%** for the hand-coding group. Some sources give about 65%.
  - AI assistance gave no statistically significant speedup.
  - The largest deficit was on **debugging** questions.
  - Participants who used AI to *build comprehension* (asking follow-up and conceptual questions) scored higher. Those who delegated code-writing entirely scored poorly.
  — [Anthropic research post](https://www.anthropic.com/research/AI-assistance-coding-skills); [arXiv 2601.20245](https://www.arxiv.org/pdf/2601.20245); [InfoQ, Feb 2026](https://www.infoq.com/news/2026/02/ai-coding-skill-formation)
- Limitation: comprehension was measured immediately after the task, not as long-term skill — [InfoQ](https://www.infoq.com/news/2026/02/ai-coding-skill-formation)
- Matuschak & Nielsen argue that understanding depends on internalized fundamentals and reject "just look it up" — [ttft 2019](https://numinous.productions/ttft/). Carter & Nielsen argue that good interfaces change the user's own reasoning through internalization — [Distill 2017](https://distill.pub/2017/aia/)
- Why this matters for oversight: Bainbridge's irony says that humans asked to take over in abnormal situations need skills that automation erodes. The Anthropic finding that debugging understanding is hurt most applies this irony directly to code. [Bainbridge NOT RE-VERIFIED] — [Bainbridge 1983](https://doi.org/10.1016/0005-1098(83)90046-8); [Anthropic 2026](https://www.anthropic.com/research/AI-assistance-coding-skills)

**Allocation, delegation, and choosing between options**
- Agarwal et al. conclude that the optimal design delegates whole cases to humans *or* AI, rarely to AI-assisted humans — [NBER w31422](https://www.nber.org/papers/w31422). Vaccaro et al. recommend designing division of labor. Only 3 experiments had tested it (g = 0.22, not significant) — [arXiv v2](https://arxiv.org/html/2405.06087v2)
- In chess, engine diversity made "which program to use" a live human choice again in 2024 — [Marginal Revolution 2024](https://marginalrevolution.com/marginalrevolution/2024/02/centaur-chess-is-now-run-by-computers.html). Earlier human value came from comparing programs and investigating where they disagreed — [Business Insider](https://www.businessinsider.in/humans-are-on-the-verge-of-losing-one-of-their-last-big-advantages-over-computers/articleshow/25275602.cms)

**Supplying context and goals**
- In radiology, *contextual information* (clinical history) improved performance where AI predictions did not — [NBER w31422](https://www.nber.org/papers/w31422)
- Licklider assigns humans to "set the goals, formulate the hypotheses, determine the criteria, and perform the evaluations" — [Licklider 1960](https://groups.csail.mit.edu/medg/people/psz/Licklider.html). This is vision, not evidence.
- Vaccaro et al. found synergy is positive when humans are the stronger partner (g = +0.46) — [arXiv v2](https://arxiv.org/html/2405.06087v2). Tasks whose quality depends on information only the human has (intent, organizational constraints, tacit knowledge) are where that condition can still hold.

**Accountability and approval of consequential actions**
- Goh et al. found LLM-alone outperformed physicians, yet still advise against autonomous use without oversight — [JAMA Netw Open 2024](https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2825395)
- Microsoft's Magentic-UI (July 2025) uses "action guards". Actions are labeled always, maybe, or never irreversible. Always-irreversible actions (for example, uploading a file) go straight to human approval, maybe-irreversible ones go to an LLM judge, and never-irreversible ones (for example, scrolling) run automatically — [arXiv 2507.22358](https://arxiv.org/abs/2507.22358); [Microsoft Research blog](https://www.microsoft.com/research/blog/magentic-ui-an-experimental-human-centered-web-agent/)
- Caution: Parasuraman & Manzey show approval and monitoring roles are vulnerable to automation bias in experts and are not fixed by training — [PubMed](https://pubmed.ncbi.nlm.nih.gov/21077562/). Lee et al. show that higher trust in GenAI goes with less critical thinking — [Lee et al. 2025](https://advait.org/files/lee_2025_ai_critical_thinking_survey.pdf)

**Sensemaking**
- Pirolli & Card (2005) model analyst work as a *foraging loop* (seek, filter, read, extract) and a *sensemaking loop* (build a mental model or schema that accounts for evidence, then apply it), and identify leverage points for technology — [Pirolli & Card 2005 PDF](https://www3.cs.stonybrook.edu/~mueller/teaching/cse591_visAnalytics/sensemaking.pdf)
- Sensecape (UIST 2023) found that externalized multilevel abstraction helped users explore more topics and structure knowledge hierarchically. Details are in Q5 — [arXiv 2305.11483](https://arxiv.org/abs/2305.11483)
- Lee et al. find that GenAI shifts knowledge-worker effort toward verification, integration, and "task stewardship". This describes the human role moving toward sensemaking and stewardship — [Lee et al. 2025](https://advait.org/files/lee_2025_ai_critical_thinking_survey.pdf)

**Creation tasks**
- Creation tasks showed a positive (though not significant) synergy estimate (g = +0.19), significantly different from decision tasks — [arXiv v2](https://arxiv.org/html/2405.06087v2)

### Inferences
- If a role relies only on "the human checks the AI's output", it is the role most likely to shrink as AI improves (Vaccaro's AI-better quadrant), and the one people perform worst (Bainbridge; automation bias).
- Roles with the most durable support: (1) the human as *learner*, keeping a working mental model of the system so they can direct, question, and recover; (2) the human as *allocator and goal-setter*, providing intent, constraints, and context the AI lacks; (3) the human as *accountable approver of irreversible changes*, but only if the interface makes approval cheap to reason about, not a rubber stamp.
- Feynman's "What I cannot create, I do not understand" (provenance not re-verified) lines up with the Anthropic finding: understanding comes from reconstruction and inquiry, not from receiving a finished artifact. An AI-generated diagram the user only looks at is the "delegation" pattern. A diagram the user rebuilds, predicts, or interrogates is the "comprehension" pattern.

### Gaps
- No rigorous evidence was found that humans add value by "setting values" in settings where AI is superhuman. It remains a normative and accountability argument.
- No longitudinal study shows whether comprehension-preserving interaction patterns hold up over months of agentic coding.
- No measured results for Magentic-UI's co-planning or action guards were extracted.

---

## 4. External cognition: when diagrams help and when they hurt

### Takeaway
Diagrams help when they are *computationally* (not just informationally) better for the inferences the user needs to make. They index information by location, put related items next to each other, and make explicit what text leaves implicit. Larkin & Simon stress that an arbitrary diagram is not automatically useful: it must be built to exploit these properties. Scaife & Rogers locate the benefit in the interaction between internal and external representations, through computational offloading. Pirolli & Card show that sensemaking is a loop of foraging and schema-building that a workspace can support.

### Cited Findings
- **Larkin & Simon (1987), "Why a Diagram is (Sometimes) Worth Ten Thousand Words", *Cognitive Science* 11: 65–100 [THEORY + computational models]:**
  - Representations can be *informationally equivalent* (the same information can be inferred from each) yet not *computationally equivalent* (the same inferences are not equally easy).
  - Diagrams are indexed by location in a plane, so related information sits together and search costs less.
  - Diagrams display explicitly information that sentential forms leave implicit and expensive to compute.
  - Caveat: none of this ensures an arbitrary diagram is worth any set of words. A diagram must be *constructed* to take advantage of these features.
  — [Larkin & Simon PDF (UCSD mirror)](https://mechanism.ucsd.edu/bill/teaching/F12/cs200/Readings/larkin.whyadiagramissometimesworth.1987.pdf); [CogSci summary](https://www.jimdavies.org/summaries/larkin1987.html)
- **Scaife & Rogers (1996), "External cognition: how do graphical representations work?", *Int. J. Human-Computer Studies* 45: 185–213 [THEORY/REVIEW]:**
  - External cognition is the interaction between internal and external representations during cognitive tasks.
  - The paper analyzes *computational offloading*, which reduces cognitive effort by using external representations.
  - The paper's other central concepts are *re-representation* (the same structure in different forms changes problem difficulty) and *graphical constraining* (a representation's form limits the inferences that can be drawn). [NOT RE-VERIFIED for exact wording]
  — [Scaife & Rogers PDF (Dourish course mirror)](https://www.dourish.com/classes/ics234bs03/15-ScaifeRogers-ExternalCog.pdf); [EduTech wiki](https://edutechwiki.unige.ch/en/External_cognition)
- **Pirolli & Card (2005), "The sensemaking process and leverage points for analyst technology as identified through cognitive task analysis" (Int. Conf. on Intelligence Analysis) [EMPIRICAL CTA + MODEL]:**
  - Two nested loops: a foraging loop (seek, filter, read, extract) and a sensemaking loop (build a mental model that accounts for evidence).
  - The paper identifies leverage points where technology can help.
  — [Pirolli & Card PDF](https://www3.cs.stonybrook.edu/~mueller/teaching/cse591_visAnalytics/sensemaking.pdf); [VisLab summary](https://vislab-ccom.unh.edu/VTDP_web_pages/VTDP_Sensemaking.html)
- Victor: visual abstraction suits human pattern recognition and complements symbolic abstraction. Multiple linked representations bring out different patterns — [Victor 2011](https://worrydream.com/LadderOfAbstraction/)
- Engelbart: the key augmentation capability is the speed and flexibility of transforming one form into another, including computer-generated "views" — [Engelbart 1962](https://www.dougengelbart.org/content/view/138)

### Inferences
- For code-architecture maps, the Larkin & Simon test is: *which inferences does the diagram make cheap?* Examples include "what depends on X", "where does data flow from A to B", and "what breaks if I change this". A box-and-arrow layout produced by an LLM and dagre is informationally rich but may not be computationally better for those questions unless its layout and encoding are designed for them. Larkin & Simon's own caveat warns exactly about this.
- Scaife & Rogers' re-representation argues for *multiple switchable views* of the same codebase (call graph, data flow, module ownership, change-impact) rather than one canonical diagram. This matches Victor's linked representations and Engelbart's "views".
- The value of a diagram is in the *interaction* between the user's internal model and the external one. A diagram the user never acts on (rearranges, annotates, queries, predicts against) gets limited offloading benefit.

### Gaps
- The search budget ran out before verifying these key "diagrams hurt" sources, which the report writer should treat as candidates to check, not citations:
  - Cognitive load theory (Sweller 1988; split-attention and redundancy effects).
  - The expertise reversal effect (Kalyuga et al. 2003: aids that help novices can hurt experts).
  - Petre (1995), "Why Looking Isn't Always Seeing: Readership Skills and Graphical Programming" (CACM): graphical notations are not inherently superior, and experts depend on learned readership skills and secondary notation.
  - Green & Petre's Cognitive Dimensions of Notations (1996).
  - Ainsworth's DeFT framework for multiple representations (2006).
- Program-comprehension studies of spatial code environments (for example, Code Bubbles, Bragdon et al. CHI 2010; Code Canvas/Debugger Canvas at Microsoft Research) were not verified.

---

## 5. Recent HCI research (2023–2026) on canvas, graph, and direct-manipulation interfaces for LLMs and agents

### Takeaway
A small but consistent body of work suggests that non-linear, spatial, and direct-manipulation interfaces help with localized edits and sensemaking. DirectGPT is the strongest measured result: about 50% faster, 50% fewer prompts, and 72% shorter prompts than ChatGPT for editing tasks. Sensecape found broader exploration and better structuring. Graphologue's evidence is qualitative. Agent work (Magentic-UI) treats an *editable plan* as the steering surface plus human approval of irreversible actions, but measured results were not extracted. Most studies are small lab studies with short tasks. None measures long-term understanding or outcomes against "AI alone".

### Cited Findings
- **DirectGPT** (Masson, Malacria, Casiez, Vogel; CHI 2024) [EMPIRICAL]:
  - A direct-manipulation layer over ChatGPT. Its four elements are: continuous representation of generated objects; reusable prompt syntax in a toolbar; manipulable outputs that control where a prompt applies (for example, select or point at the part to change); and undo.
  - In a user study editing text, code, and vector images, participants were about **50% faster** and used about **50% fewer** and **72% shorter** prompts than with baseline ChatGPT.
  - Participants relied on and preferred direct manipulation for specific, localized tasks.
  — [arXiv 2310.03691](https://arxiv.org/html/2310.03691v2); [HAL](https://hal.inrae.fr/CRISTAL-LOKI/hal-04568776v1); [author PDF](https://cs.uwaterloo.ca/~dmasson/pdfs/directgpt.pdf); code at [GitHub](https://github.com/m-damien/DirectGPT). Sample size and statistics were not extracted this session.
- **Sensecape** (Suh, Min, Palani, Xia; UIST 2023) [EMPIRICAL, within-subject]:
  - A canvas plus a hierarchy view for LLM-based exploration, supporting multilevel abstraction and moving between foraging and sensemaking.
  - In a within-subject study, participants explored more topics and structured knowledge hierarchically. The authors credit the externalized levels of abstraction.
  — [arXiv 2305.11483](https://arxiv.org/abs/2305.11483); [UCSD PDF](https://hci.ucsd.edu/papers/sensecape.pdf). N, baseline, and metrics were not extracted.
- **Graphologue** (Jiang, Rayan, Dow, Xia; UIST 2023) [QUALITATIVE]:
  - Converts LLM text responses into interactive node-link diagrams in real time.
  - A formative study (n = 10) found long-winded LLM answers make key information hard to pick out.
  - An evaluation with 7 experienced LLM users reported faster grasp of key concepts. This was qualitative, not a controlled comparison.
  — [arXiv 2305.11473](https://arxiv.org/abs/2305.11473v2); [UCSD PDF](https://hci.ucsd.edu/papers/graphologue.pdf)
- **Magentic-UI** (Microsoft Research, July 2025) [SYSTEM + mixed evaluation]:
  - An open-source human-in-the-loop web agent. Users edit the agent's plan in a plan editor or give textual feedback *before* execution (co-planning), and action guards gate irreversible actions.
  - Evaluation combined agentic benchmarks, simulated-user testing, qualitative studies with real users, and safety assessments.
  — [arXiv 2507.22358](https://arxiv.org/abs/2507.22358); [MSR blog](https://www.microsoft.com/research/blog/magentic-ui-an-experimental-human-centered-web-agent/). Quantitative co-planning results were not extracted.
- **tldraw "Make Real" and follow-ons** [INDUSTRY EXPERIMENTS, no controlled evaluation]:
  - Make Real (late 2023) sends a hand-drawn UI sketch on the canvas to a vision model (GPT-4V) and returns a working prototype that the user can annotate and regenerate. The hosted demo has since ended.
  - "tldraw computer" chained prompts as canvas components.
  - Talks in 2025–2026 cover agents acting on the canvas through tldraw's runtime API.
  — [tldraw blog: "make real, the story so far"](https://tldraw.dev/blog/make-real-the-story-so-far); [Simon Willison, Nov 2023](https://www.simonwillison.net/2023/Nov/16/tldrawdraw-a-ui); [AI Engineer 2025 talk listing](https://www.ai.engineer/talks/1C2TdPkj6aQ-tldraw-computer); [AI Engineer Europe 2026, "Agents on canvas in tldraw"](https://www.ai.engineer/talks/sPUjIBH5Cwg-agents-on-canvas-in-tldraw)
  - Search results stated that an offline tldraw desktop app launched 16 July 2026. [Secondary; unverified]
- **Chat critique as a design driver**: Wattenberger (2023) and Appleton (2023) argue that chat lacks affordances and isolates responses. These are design arguments, not studies — [Wattenberger](https://wattenberger.com/thoughts/boo-chatbots); [Smashing Magazine 2024](https://smashingmagazine.com/2024/02/designing-ai-beyond-conversational-interfaces)
- **Steering through intermediate representations** also appears in Ink & Switch's call for direct manipulation as the base of a gentle slope, with AI as an accelerator inside a malleable substrate rather than a replacement for precise control — [Ink & Switch 2025](https://www.inkandswitch.com/essay/malleable-software/)

### Inferences
- The best-supported benefit of canvas and direct manipulation is **precision and locality**: pointing at the thing to change instead of describing it in prose (DirectGPT). For Rassam this means canvas nodes should be *handles* for scoping agent actions ("refactor this", "explain the path between these two nodes"), not just pictures.
- Sensecape and Graphologue support canvases for *exploration and sensemaking* breadth, but their outcome measures are weak (topic counts, qualitative reports). None measures whether users understand the system better afterward, and none compares against AI-alone answers. This is a research gap Rassam could fill with its own evaluations.
- The agent-interface trend (Magentic-UI co-planning, action guards) treats the **plan** as the human-editable intermediate representation. For a code-focused product, the analogous objects are a *change plan rendered on the architecture map* and approval at the point of irreversibility (merge, deploy, schema migration).

### Gaps
- **Luminate** (Suh et al., CHI 2024; generating and exploring a structured design space), **Spellburst**, **ChainForge**, **AI Chains / PromptChainer**, and code-specific works (for example, visual program-comprehension aids for LLM-generated code) were not reviewed with sources this session.
- No controlled study compares a canvas interface against chat for *codebase understanding* tasks (for example, answer accuracy, time, or later recall of architecture). This is a gap in the literature, as far as this session could find.
- Sample sizes and statistical details for DirectGPT and Sensecape were not extracted.

---

## Implications for Rassam

- **Don't make the human the per-node checker of an AI-drawn diagram.** As AI becomes better than people at reading repos and drawing architecture, human-in-the-loop verification of each item is expected to *lower* quality relative to AI alone (synergy g = −0.54 when AI is better; [Vaccaro et al.](https://arxiv.org/html/2405.06087v2)). The human is also a poor monitor ([Parasuraman & Manzey](https://pubmed.ncbi.nlm.nih.gov/21077562/); Bainbridge). Design an explicit division of labor instead:
  - The AI builds and maintains the map.
  - The human supplies intent, constraints, and context the AI lacks. Context, not AI predictions, is what helped radiologists ([Agarwal et al.](https://www.nber.org/papers/w31422)).
  - The human approves *irreversible* changes only, in the style of action guards ([Magentic-UI](https://arxiv.org/abs/2507.22358)).
- **Turn the canvas from a picture into a steering surface for agents.** Nodes and edges should be direct-manipulation handles that scope agent actions ("change this boundary", "trace this path"). Agent change plans should render *on the map* and be editable before execution. Evidence: [DirectGPT](https://arxiv.org/html/2310.03691v2) (about 50% faster, about 50% fewer prompts on localized edits) and Magentic-UI co-planning. This is the Licklider "desk-surface" shared workspace with agents in place of a 1960 computer.
- **Make "understanding" the product, and use cognitive forcing where stakes are high.** AI delegation measurably harms comprehension, especially debugging (50% vs 67%; [Shen & Tamkin 2026](https://www.anthropic.com/research/AI-assistance-coding-skills)). Inquiry-style use preserves it. Offer Feynman-style "reconstruct it" modes:
  - Predict the call path or impact before the AI reveals it.
  - Sketch the architecture yourself and diff it against the AI's map.
  - Answer a question before seeing the answer.
  Cognitive forcing cuts over-reliance, but users dislike it ([Buçinca et al.](https://arxiv.org/abs/2102.09692)). Make it opt-in or reserve it for high-stakes moments (onboarding, pre-merge review of agent changes).
- **Implement Victor's ladder of abstraction and Engelbart's fast view transformation, not one canonical diagram.** Each node should zoom from system to module to file/function to concrete runtime example or trace. Offer multiple switchable re-representations (dependency, data flow, ownership, change-impact) designed so the specific inferences users need become cheap. Larkin & Simon warn that a diagram only helps if *constructed* for that ([Victor](https://worrydream.com/LadderOfAbstraction/); [Larkin & Simon](https://mechanism.ucsd.edu/bill/teaching/F12/cs200/Readings/larkin.whyadiagramissometimesworth.1987.pdf); [Engelbart](https://www.dougengelbart.org/content/view/138)).
- **Ground trust in evidence links, not persuasive explanations.** Explanations increased acceptance of AI advice whether right or wrong ([Bansal et al.](https://arxiv.org/abs/2006.14779)), and confidence displays did not moderate synergy ([Vaccaro et al.](https://arxiv.org/html/2405.06087v2)). Every AI-asserted node or edge should link to the exact code and lines (provenance), carry "derived vs. verified" status, and make verification cheap. A wall of rationale text is the wrong tool.
- **Make the human-authored layer a durable, shareable, user-owned asset.** That layer is Bush's "trails": curated paths, annotations, rationale, and "why this matters" through a codebase, contributed by "trail blazers" ([Bush 1945](https://www.theatlantic.com/magazine/archive/1945/07/as-we-may-think/303881/)). Store it local-first and keep it malleable ([Ink & Switch](https://www.inkandswitch.com/essay/malleable-software/)). Unlike raw diagrams, which a model can regenerate any time, intent, context, and judgment are the inputs AI cannot supply on its own.
- **Lean toward creation tasks.** Synergy was positive (g = +0.19, not significant) for creation tasks and negative for decision tasks ([Vaccaro et al.](https://arxiv.org/html/2405.06087v2)). Examples: designing a new architecture, planning a refactor, sketching a system and having it "made real" (tldraw-style), exploring alternative designs side by side. This beats pure "audit what the AI said" decision work.
- **Measure synergy, not satisfaction.** Run evaluations comparing human+Rassam vs AI-alone vs human-alone on codebase tasks (locating a bug, answering architecture questions, assessing change impact), recording accuracy, time, and later recall. Self-reported speedups are unreliable: METR developers believed they were about 20% faster while being 19% slower ([METR 2025](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)). No published study yet measures canvas-vs-chat for codebase understanding, so Rassam could produce that evidence itself.
