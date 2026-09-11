# Personal Awareness · Engineering Contract v0.2.1

**Status:** PRODUCT LOGIC FROZEN
**Purpose:** Engineering implementation contract
**Authority:** This document is the highest-level product-logic and epistemic constraint for this repository.

Implementation may optimize performance, storage, code organization, APIs, dependencies, and UI details.

Implementation MUST NOT merge, weaken, remove, reinterpret, or bypass the epistemic boundaries defined here for engineering convenience.

---

# 1. Product Principle

Personal Awareness is not primarily a note-taking app, knowledge base, personality analyzer, or AI companion.

Its purpose is:

> 让过去获得的知识、经历、行为与思考，在真正需要的时候重新参与一个人的决策与觉察。

The product operates around:

> 一个人 + 时间 + 经历 + 行为 + 思考 + 变化

Core principle:

> **AI 不替你认识自己，AI 帮你看见自己。**

The AI may:

- observe;
- organize;
- compare;
- detect structures;
- propose hypotheses;
- expose patterns;
- ask questions;
- return selected information to attention.

The AI MUST NOT:

- decide what an experience ultimately means for the user;
- convert speculation into fact;
- create permanent personality conclusions from weak evidence;
- treat agreement as proof;
- treat disagreement as evidence that a hypothesis is secretly true;
- manufacture independent evidence through repeated prompting.

The system follows:

> **模型负责提出可能性；系统负责守住事实边界；用户负责决定意义。**

And:

> **对事实不投降，对意义不夺权。**

---

# 2. Core Pipeline

Canonical personal-awareness pipeline:

```text
Record
→ Relation Claim
→ Hypothesis
→ Discovery / Attention
→ Reflection Episode
→ User Reflection Record
```

External knowledge is a parallel sidecar:

```text
Personal Records
→ Relation
→ Hypothesis
→ Discovery
→ User Reflection
        ↕
External Reference
```

External Reference MUST NOT silently become personal evidence.

---

# 3. Core Entities

Canonical domain entities:

1. `Record`
2. `RelationClaim`
3. `Hypothesis`
4. `Discovery`
5. `ReflectionEpisode`
6. `UserReflectionRecord`
7. `Directive`
8. `ReflectionPreference`
9. `CurrentFocusContext`

Cross-cutting concerns:

- Provenance
- Time Semantics
- Lineage
- Usage / Sovereignty
- Target-scoped State Assignment

---

# 4. Record

A `Record` represents something actually stored by the system.

Possible epistemic roles include:

```text
observed_event
observed_state
user_expression
user_reported_pattern
user_reported_interval
platform_metadata
external_reference
ai_hypothesis
directive
product_event
```

One source item may have multiple semantic or epistemic roles.

However:

> **One original information source remains one Evidence Unit.**

Multiple classifications of the same source MUST NOT create multiple independent pieces of evidence.

## 4.1 Provenance

A Record must preserve sufficient provenance to answer:

- Where did this come from?
- Who produced it?
- Was it directly observed, imported, generated, or reported?
- What original object can it be traced back to?

Recommended fields:

```text
origin
actor
source_ref
captured_at
```

## 4.2 Raw Expression Preservation

User wording must be preserved when available.

Modal language MUST NOT be silently removed.

Examples:

```text
"可能"
"好像"
"我觉得"
"不知道"
"也许"
```

A statement such as:

> "我可能是因为……"

must not be normalized into:

> "用户是因为……"

---

# 5. Time Semantics

Time must preserve what kind of time is actually known.

Possible semantics include:

```text
event_time
observation_time
capture_time
user_reported_time
user_reported_interval
```

The system MUST NOT upgrade one time semantic into another.

Example:

A following snapshot observed at `2026-09-01` means:

> At observation time, the account was following X.

It does NOT prove:

> The user followed X on 2026-09-01.

## 5.1 Snapshot ≠ Event

One snapshot establishes only the observed state at that observation point.

Multiple snapshots may support persistence at observed points.

A sequence:

```text
not-following
→ following
```

may support a transition occurring somewhere within the observation interval.

It does NOT establish an exact transition time unless such time is independently known.

---

# 6. Lineage

Lineage is system-wide and mandatory.

Recommended fields:

```text
parent_refs
relation_to_parent
```

Supported lineage relations include:

```text
derived_from
responds_to
references
revises
supersedes
summarizes
```

The relation set is extensible.

## 6.1 No Double Counting

The following MUST NOT become independent Evidence Units:

- an AI summary of an existing user record;
- a reformatted version of the same event;
- repeated AI questions about the same event;
- multiple semantic labels attached to one source;
- a response created only because the AI repeatedly pushed the same hypothesis.

Core invariant:

> **Same information lineage cannot manufacture additional independent evidence.**

---

# 7. Relation Claim

Relation Detection is NOT a single-label classification task.

It is:

> **开放式、证据约束下的 Relation Claim（关系命题）发现任务。**

One case may yield:

```text
0 … N Relation Claims
```

Canonical claim unit:

```text
record_refs
comparison_axis
relation_type
evidence
evidence_strength
```

Relation describes:

> What evidence-supported structure exists between records.

Relation does NOT explain why the structure exists.

That belongs to Hypothesis.

## 7.1 Open Relation Taxonomy

Relation types are non-exhaustive.

Novel Relation Claims may be accepted if they satisfy the gates and evidence requirements.

The system MUST NOT invent hidden causes merely because no existing taxonomy label fits.

## 7.2 No Sufficient Relation

`No Sufficient Relation` is an evaluation outcome.

It is NOT:

- a Relation Type;
- proof that no future relation will ever exist;
- a permanent classification.

New records may change later evaluation while historical evaluation remains historically valid.

---

# 8. Relation Hard Gates

Before evidence scoring, a candidate Relation Claim must pass the required gates.

## Gate 1 — Usage Permission

The underlying records must permit the intended analysis.

User directives override system preference.

## Gate 2 — Epistemic Eligibility

The proposed evidence must be eligible for the descriptive claim being made.

AI hypotheses, generated summaries, and external references MUST NOT masquerade as observed personal facts.

## Gate 3 — Operational Comparability

Records must support a sufficiently specific, same-nature Comparison Axis.

Shared words, themes, abstract categories, or verbs alone are insufficient.

Sanity test:

> **具体比较什么？**

Bad:

```text
都在准备
都和压力有关
都在逃避
```

Potentially valid:

```text
收到集体活动邀请后是否参加
任务距离截止时间多远时开始实际执行
写作卡顿以后选择重开文档还是修改原文
```

If the only answer is:

> "它们都属于 X"

comparability normally fails.

## Gate 4 — Temporal Legibility

This gate asks:

> Is the temporal interpretation itself legally supported?

It does NOT ask how strong the temporal evidence is.

That is scored later under `Temporal Adequacy`.

## Gate 5 — Lineage Integrity / No Double Counting

The claim must not depend on duplicated, derivative, or artificially multiplied evidence.

## Gate 6 — Abstraction Ceiling

A descriptive Relation Claim must not silently escalate into:

- personality;
- identity;
- permanent trait;
- hidden motive;
- certain causal explanation.

---

# 9. Evidence Support Score

The system may calculate `evidence_support_level`.

This score represents:

> **support for the descriptive Relation Claim only.**

It does NOT represent:

- truth probability;
- importance;
- current relevance;
- attention priority;
- hypothesis probability;
- user agreement.

Weights:

```text
Structural Strength                  20%
Independent Support                 20%
Temporal Adequacy                   15%
Specificity / Baseline Contrast     20%
Counterevidence Balance             15%
Evidence Fidelity                   10%
```

Support levels:

```text
0–44   weak
45–69  observed
70–84  supported
85–100 strong
```

Each dimension is judged on a 0–3 semantic scale by the model.

Arithmetic and threshold conversion MUST be deterministic code.

---

# 10. Evidence Dimension Anchors

## 10.1 Structural Strength

How clearly does the proposed structure appear in the eligible records?

```text
0 = no defensible structure beyond coincidence or vague similarity
1 = weak structure; interpretation depends heavily on framing
2 = clear structural correspondence supported by the records
3 = strong and repeated/explicit structural correspondence with little ambiguity
```

## 10.2 Independent Support

This is relative to the minimum evidence required by the proposed Relation Type.

```text
0 = insufficient independent support, or support is lineage-duplicated
1 = exactly the minimum independent evidence required
2 = more than the minimum, or independent cross-validation exists
3 = multiple genuinely independent repetitions/corroborations beyond the minimum
```

A Change relation requiring two endpoints must not be punished merely because it has two records.

Repeated sampling of the same state must not automatically inflate Persistence.

## 10.3 Temporal Adequacy

Only scored AFTER Temporal Legibility passes.

```text
0 = legal temporal interpretation, but evidence is too temporally weak for the claim
1 = minimum usable temporal support
2 = good temporal coverage/order for the claimed relation
3 = strong temporal coverage, spacing, ordering, or repeated temporal support
```

## 10.4 Specificity / Baseline Contrast

```text
0 = generic/common baseline sufficiently explains the observation
1 = some specificity, but no reliable Personal Baseline
2 = the record itself contains a clear internal baseline or condition contrast
3 = reliable Personal Behavioral Baseline or strong cross-context contrast
```

Without a reliable baseline, this dimension normally cannot exceed `1`,
unless the record itself explicitly supplies an internal baseline.

Example internal baseline:

> "我平时很少点这家，但那几周连续点了。"

The system MUST NOT invent a baseline.

## 10.5 Counterevidence Balance

Only factual counterevidence counts.

```text
0 = strong factual counterevidence substantially undermines the claim
1 = meaningful factual counterevidence exists
2 = little factual counterevidence, or evidence is mixed but claim remains supported
3 = relevant factual evidence is strongly consistent and no meaningful factual counterevidence is present
```

User attitude alone is NOT factual counterevidence.

Examples that do NOT change evidence score:

```text
"我觉得只是巧合。"
"我不同意。"
"我不想这么理解。"
```

These update user position, not evidence support.

A new concrete fact may change the score.

Core rule:

> **用户态度改变 Status；用户提供的新事实改变 Evidence Support。**

## 10.6 Evidence Fidelity

How directly do the records support the already-valid Comparison Axis?

```text
0 = evidence only loosely or indirectly touches the axis
1 = partial support requiring substantial interpretation
2 = records directly support most of the axis
3 = records directly and explicitly support the axis with minimal interpretive leap
```

Operational Comparability asks whether the Axis is legal.

Evidence Fidelity asks how directly evidence supports that legal Axis.

---

# 11. Observation Space

Not every real record must immediately enter Relation detection.

Core principle:

> **现在不能进入关系判定 ≠ 以后没有价值。**

Observation Space is a View / Query over records, not necessarily a separate persistent entity.

Possible observation states:

```text
resolved
unresolved
user_wants_to_watch
excluded_from_analysis
```

Out-of-taxonomy observations are allowed.

Core principle:

> 不是所有真实痕迹都需要立刻被解释；有些东西只需要先被看见、被保留，等待未来的生活赋予它新的关系。

---

# 12. User-reported Pattern and Interval

A single Record saying:

> "我天天这样。"

or:

> "每次都这样。"

is stored as:

```text
user_reported_pattern
```

It is evidence that:

> The user reported this pattern.

It is NOT automatically system-verified cross-time repetition.

Likewise:

> "这半年我从来不主动打电话。"

is:

```text
user_reported_interval
```

The system knows the user later reported that interval.

The system MUST NOT split this statement into many synthetic observed events.

---

# 13. Hypothesis

Relation and Hypothesis MUST remain separate.

Relation:

> What structure exists?

Hypothesis:

> Why might this structure exist?

Hypothesis Layer is NOT intended to find the true hidden cause.

Its purpose is:

> 提出少量有证据锚定、彼此可竞争、可由未来证据区分的可能解释。

Formal storage of a Hypothesis does NOT make it true.

---

# 14. Hypothesis Admission Gates

A hypothesis must pass ALL applicable admission requirements.

## H1 — Anchor

A Hypothesis requires either:

```text
≥ 1 Supported Relation
```

OR:

```text
≥ 2 mutually independent Observed Patterns
```

For the second path, the patterns must not simply repackage the same primary Evidence Units under different axes.

## H2 — Positive Directional Support

A Hypothesis must have:

> **正向方向性证据**

At least one observable feature in existing evidence must actively point toward that explanatory direction.

The following are insufficient:

```text
not ruled out
logically possible
compatible with the evidence
no contradiction found
```

Core rule:

> **Compatibility is not Support.**

And:

> **absence of contradiction ≠ evidence of support**

## H3 — Explanatory Gain

The Hypothesis must:

1. add mechanism or conditional structure not already directly stated by the Relation; and
2. generate at least one non-synonymous discriminating prediction.

Pure rephrasing fails.

## H4 — Alternative Awareness

The system must remain aware that competing explanations may exist.

No hypothesis is presented as uniquely true merely because it passed admission.

## H5 — Discriminating Evidence

The system should be able to describe future evidence that would:

```text
strengthen
```

and:

```text
weaken
```

the hypothesis.

## H6 — Abstraction Ceiling

Hypotheses must not automatically become claims about:

- personality;
- identity;
- permanent attributes;
- essential nature;
- certain causality.

---

# 15. Hypothesis Evidence Rules

User agreement is not automatically evidence.

Examples:

```text
"对。"
"好像是。"
"可能吧。"
```

may indicate resonance or user position.

They do not automatically increase objective evidence support.

New independent factual information supplied by the user may strengthen or weaken a hypothesis.

Time passing alone does not strengthen a hypothesis.

---

# 16. State Model

There is NO Case-global state.

State must attach to a specific target.

Canonical shape:

```text
StateAssignment {
  target_ref
  target_type
  user_position
  workflow_state
  presentation_state
}
```

Possible values:

```text
user_position:
  none
  agrees
  disagrees
  uncertain

workflow_state:
  active
  suspended

presentation_state:
  active
  archived
```

## 16.1 User Disagreement Does Not Erase Evidence

Valid state combination:

```text
evidence_support_level = strong
user_position = disagrees
workflow_state = suspended
```

A user's disagreement does not make established descriptive evidence disappear.

## 16.2 Suspension

If a Relation is suspended:

- evidence remains;
- no new Hypothesis generation from that Relation;
- no Level 2 or Level 3 presentation;
- at most Level 1 backend retention;
- future independent facts may still be received and re-evaluated.

If an existing Hypothesis is uniquely anchored to that suspended Relation, its active progression also stops.

Do not invent a separate "Hold" state.

## 16.3 Archive

Archive is an attention/presentation decision.

Archive does NOT mean:

- false;
- deleted;
- disproven;
- evidence removed.

---

# 17. Discovery / Attention

Evidence Strength and Attention Priority are separate.

A strong old relation may deserve no active attention.

A weaker but currently relevant relation may deserve presentation.

Attention signals:

```text
Novelty
Current Relevance
Temporal Depth
Reflection / Action Potential
Interpretation Risk
```

The system computes one Attention Priority.

Do NOT create a second overlapping "Discovery Value" score unless required for implementation and semantically distinct.

---

# 18. Presentation Levels

Only three presentation levels exist:

```text
Level 1
backend observation only

Level 2
available in Awareness Stream / Observation Field when user opens it

Level 3
proactive reminder / push
```

Rules:

```text
presentation_state = archived
→ no Level 2 / Level 3

workflow_state = suspended
→ max Level 1

Attention low
→ Level 1

Attention medium/high
→ eligible for Level 2
→ not automatically Level 2

Current Relevance unknown
→ Level 3 prohibited
→ Level 2 not automatically prohibited
```

For MVP:

> **Level 3 is disabled by default.**

Level 3 requires explicit proactive-reminder permission and additional strict gating.

---

# 19. CurrentFocusContext

Current relevance may use lightweight `CurrentFocusContext`.

It must be:

- traceable;
- removable;
- overrideable;
- temporary;
- non-personality-based.

Possible fields:

```text
source
last_mentioned_at
explicit_duration
relevance_state
```

Possible relevance lifecycle:

```text
active
→ fading
→ inactive
```

If the user provides an explicit duration, honor it.

Otherwise use elastic fading rather than fabricating a precise expiry.

Expiry reduces current relevance.

It does NOT delete historical records.

---

# 20. Attention Management

The product includes:

> **Attention Management（注意力管理）**

Mainstream systems often optimize for:

> Attention Capture（注意力捕获）

Personal Awareness should optimize for:

> Attention Return（注意力归还）

The Observer acts as an:

> **Attention Mediator（注意力中介）**

The intended sequence is:

```text
发现某件关于用户自己的事情值得重新进入注意力
→ 把它带回来
→ 提供足够的认知支架
→ 然后退出
```

Success is NOT:

> Making the user depend on the product to think.

Success is:

> Reducing the cognitive burden of organizing one's own life and returning released attention to the user.

Influence should be:

- transparent;
- finite;
- rejectable.

---

# 21. Reflection Episode

The AI's role is Observer, not Partner.

The system may invite reflection.

It must not pursue a predetermined conclusion.

Core rules:

> **AI 可以引导用户看见可能性，但不能引导用户走向结论。**

> **系统可以邀请意义产生，但不能追逐意义产生。**

> **被影响 ≠ 被说服。**

Reflection should normally be:

> Evidence-bounded Guided Reflection

Possible structure:

```text
evidence
+ relation
+ 2–3 competing hypotheses
+ user choice
```

The system should permit responses such as:

```text
都不是
我有自己的解释
还不知道
```

Optional UI actions may include:

```text
有关系
没关系
还不确定
想说一点
先放着
```

`想说一点` is an action, not an epistemic position.

`先放着` is a workflow/presentation action, not a factual judgment.

---

# 22. Reflection Provenance

Reflection provenance is represented using two orthogonal fields.

```text
elicitation_mode:
  spontaneous
  prompted
  unknown
```

```text
stimulus_type:
  none
  open_question
  evidence_relation
  hypothesis
  external_reference
  unknown
```

Examples:

```text
spontaneous self-insight
→ spontaneous + none

AI asks an open question
→ prompted + open_question

system shows evidence/relation
→ prompted + evidence_relation

AI presents a mechanism
→ prompted + hypothesis

user reacts to an outside article
→ prompted + external_reference
```

Do NOT fabricate provenance when it is unknown.

Use `unknown`.

---

# 23. Follow-up Count

Runtime field:

```text
system_followup_count
```

Definition:

> Number of AI-initiated follow-up questions AFTER the initial stimulus.

The initial stimulus does NOT count.

User-initiated continuation does NOT count as an automatic follow-up.

Default rule:

> At most one automatic system follow-up unless the user actively continues.

If:

```text
system_followup_count > 1
```

without active user continuation, treat the episode as susceptible to:

> Prompt Contamination

A resulting response may remain stored as historical user expression.

It MUST NOT automatically strengthen hypothesis evidence.

---

# 24. Meaning Commitment

Spontaneity and certainty are orthogonal.

A spontaneous statement may still be tentative.

Canonical field:

```text
meaning_commitment:
  tentative
  confirmed
```

Example:

> "我可能只是害怕开始以后发现自己做不好。"

may become:

```text
UserReflectionRecord
elicitation_mode = spontaneous
meaning_commitment = tentative
```

It may provide Positive Directional Support for a hypothesis.

It does NOT become User-confirmed Meaning merely because it was spontaneous.

Explicit commitment such as:

> "对，我现在确实是这么理解的。"

may qualify as:

```text
meaning_commitment = confirmed
```

Even confirmed meaning remains:

> user-confirmed meaning

not:

> objective personality fact.

---

# 25. Meaning Revision

User meaning is time-indexed.

A later meaning may revise or supersede an earlier meaning.

The earlier meaning is NOT deleted, because it remains historically true that the user held that interpretation at that time.

Recommended lifecycle fields:

```text
valid_at_time
current_effect
superseded_by_ref
superseded_at
```

Use Lineage relations such as:

```text
revises
supersedes
```

Do NOT represent meaning revision by abusing:

```text
workflow_state = suspended
```

or:

```text
presentation_state = archived
```

Meaning lifecycle and workflow/presentation state are separate concerns.

---

# 26. Directive / User Sovereignty

User directives are first-class records.

The system must distinguish at least:

```text
analysis permission
storage permission
presentation permission
proactive reminder permission
future-similar policy
```

Example:

> "以后类似的也别主动提醒我。"

may be represented as:

```text
allow_analysis = true
allow_passive_storage = true
allow_proactive_presentation = false
applies_to_future_similar = true
```

This directive does NOT necessarily mean:

> Do not analyze similar future records.

A directive may target presentation without forbidding analysis.

Likewise:

> "只记录，不分析。"

is a hard analysis restriction.

User directives override discovery ranking and presentation logic.

They must be revocable.

---

# 27. External Reference

External Reference is NOT part of the core personal-evidence chain.

Default flow:

```text
Personal Trace
→ Awareness
→ User Judgment
→ External Reference
```

Core principle:

> 个人痕迹告诉系统"我经历了什么"；外部参考告诉系统"别人如何经历和理解类似的问题"。

External Reference may provide:

```text
Experience
Practical
Perspectives
Professional
```

Default retrieval priority:

> 先找"人怎么经历它"，再找"学科怎么解释它"。

External Reference MUST NOT by default:

- prove a personal hypothesis;
- define the user;
- become a personal behavioral baseline;
- become independent personal evidence.

Exception:

If the user explicitly requests outside perspective, it may be shown.

If the user relates an external reference back to themselves, create a NEW:

```text
UserReflectionRecord
```

The external reference itself still does not become proof about the user.

---

# 28. Zhihu Integration Boundary

Zhihu is primarily:

> **External Reference Layer（外部参考层）**

not a complete historical Personal Trace source.

Known strong personal-trace candidates:

```text
user-owned content
```

when body and timestamps are available and traceable.

Follow data normally represents:

```text
observed current state at captured_at
```

not exact historical follow time.

Platform metadata must not be upgraded into unsupported personal meaning.

Administrative and transactional content may be real.

But:

> **Real ≠ Relevant.**

Real records may remain context-limited and not become reflective evidence.

---

# 29. Observer Role

The product role is:

> **Observer（观察者）**

Specifically:

> 一个把所有注意力倾投到用户身上的观察者。

It is NOT designed as:

- romantic partner;
- emotional substitute;
- exclusive companion;
- dependency-seeking relationship.

The Observer maintains epistemic independence.

But meaning sovereignty belongs to the user.

---

# 30. Anti-Sycophancy / Anti-Surrender

The system must avoid two opposite failures.

## Failure A — Sycophancy

User agreement does not make an unsupported AI interpretation true.

## Failure B — Epistemic Surrender

User disagreement does not erase observed facts.

Correct disagreement protocol:

```text
records / facts
→ relation structure
→ hypothesis / meaning
```

The system may say:

> "The records still support this descriptive pattern, while you disagree with this explanation."

It must NOT say:

> "Because you disagree, the pattern never existed."

It must also NEVER use rejection as evidence that the hypothesis is secretly correct.

No self-sealing interpretation.

---

# 31. LLM vs Deterministic Code Boundary

## LLM Responsibilities

LLM may perform semantic judgments such as:

- structured observed-claim extraction;
- Comparison Axis proposal;
- candidate Relation generation;
- per-dimension 0–3 evidence judgments with reasons;
- Hypothesis generation;
- Alternative generation;
- Positive Directional Support assessment;
- Explanatory Gain assessment;
- discriminating predictions;
- Current Relevance interpretation from explicit traceable context;
- summaries clearly marked as derived artifacts.

## Deterministic Code Responsibilities

Code must enforce:

- permissions;
- directives;
- Lineage rules;
- no-double-counting;
- score arithmetic;
- thresholds;
- state transitions;
- target-scoped state;
- CurrentFocusContext TTL/fading rules;
- proactive-presentation gates;
- archive / restore;
- max automatic follow-up;
- canonical IDs;
- deduplication;
- time semantics;
- deterministic evidence-unit identity.

Core principle:

> **LLM 可以产生语义判断，代码负责执行约束。**

---

# 32. User-only Authority

The following remain under user authority:

- personal meaning;
- confirmation of meaning;
- reflection preference;
- archive / restore decisions;
- intervention level;
- agreement / disagreement / uncertainty;
- revocation of directives.

The system MUST NOT auto-land permanent personality labels as confirmed facts.

---

# 33. Reflection Preferences

Onboarding preferences describe interaction style.

They are NOT personality traits.

Possible editable preferences include:

```text
hypothesis_visibility
early_surface_tolerance
intervention_level
archive_reopen_policy
explanation_density
```

They may change over time.

Do not infer stable identity from these preferences.

---

# 34. Progressive Relation Processing

Recommended processing architecture:

```text
Candidate Generation
→ Evidence Admissibility
→ Claim Validation
→ Evidence Scoring
→ State Transition
```

Candidate generation should be semantically open.

Validation should be strict.

Presentation should be restrained.

Core principle:

> **底层追求开放性，上层追求克制。**

And:

> **宽观察，严证据，少呈现。**

---

# 35. Supported Relation Pool

A Supported Relation Pool is a query/result concept.

It need not become a separate persisted domain entity.

Similarly, Observation Space should preferably remain a View / Query unless implementation requires otherwise.

Do not create unnecessary ontology merely because a concept exists in product reasoning.

---

# 36. Evidence vs Attention Invariant

The following combination is valid:

```text
Relation A:
  evidence_support_level = strong
  current_relevance = low
  presentation = Level 1

Relation B:
  evidence_support_level = observed/supported
  current_relevance = high
  presentation = Level 2
```

The system MUST NOT rank attention purely by evidence strength.

---

# 37. Prompt Contamination Invariant

Repeated AI interaction must never masquerade as repeated independent evidence.

Example:

```text
AI asks
→ user answers
→ AI rephrases same hypothesis
→ user answers again
```

does NOT create multiple independent evidence units.

Interaction count ≠ evidence count.

---

# 38. External Reference Invariant

External articles, Zhihu answers, expert explanations, or peer experiences must not become proof that:

> "the user is that way."

External material may widen interpretation.

It cannot define the user.

---

# 39. Product Event vs Personal Evidence

System interactions may themselves be stored as Product Events.

Examples:

```text
discovery_shown
discovery_archived
directive_changed
reflection_prompted
```

These are real system events.

They do NOT automatically become evidence about personality or behavior outside the product.

---

# 40. MVP Constraints

For the hackathon MVP:

1. Preserve epistemic boundaries before adding sophistication.
2. Prefer deterministic enforcement over additional agent infrastructure.
3. Do NOT build multi-agent infrastructure into the product itself.
4. Use existing mature dependencies where practical.
5. Level 3 proactive intervention is disabled by default.
6. External Reference remains sidecar-only.
7. User meaning must remain separate from Relation and Hypothesis.
8. AI-generated artifacts must never become independent evidence through Lineage duplication.
9. All important product claims must remain traceable to source Records.
10. Engineering shortcuts must not collapse epistemic distinctions.

---

# 41. Non-Negotiable Invariants

The following are hard invariants.

### INV-01
AI Hypothesis is not factual evidence.

### INV-02
A summary of an event is not another event.

### INV-03
Repeated prompting does not manufacture independent evidence.

### INV-04
User disagreement does not erase factual evidence.

### INV-05
User agreement does not convert speculation into fact.

### INV-06
External Reference does not define the user.

### INV-07
Snapshot does not equal exact historical event time.

### INV-08
User-reported interval does not equal continuous system observation.

### INV-09
Strong Evidence Support does not imply high Attention Priority.

### INV-10
Archive does not change truth or evidence strength.

### INV-11
Suspension stops active progression but preserves existing evidence.

### INV-12
Meaning revision preserves historical meaning instead of deleting it.

### INV-13
Tentative self-interpretation remains tentative even when spontaneous.

### INV-14
Compatibility is not Support.

### INV-15
No baseline may be invented.

### INV-16
One original information source cannot become multiple independent Evidence Units through reclassification.

### INV-17
Directive scope must distinguish analysis from presentation.

### INV-18
The user owns personal meaning.

---

# 42. Engineering Review Requirement

Any architectural proposal or implementation that touches:

- Record schema;
- Relation Engine;
- Evidence scoring;
- Hypothesis admission;
- Lineage;
- user directives;
- Reflection provenance;
- meaning lifecycle;
- Attention / Discovery;
- External Reference usage;

must explicitly state how it preserves the relevant rules in this document.

If an implementation appears easier only by collapsing two concepts that this contract keeps separate, the implementation must be changed.

The contract is not to be weakened.

---

# 43. Final Product Principle

The system should remember:

> **AI 不替你认识自己，AI 帮你看见自己。**

> **模型负责提出可能性；系统负责守住事实边界；用户负责决定意义。**

> **Compatibility is not Support.**

> **对事实不投降，对意义不夺权。**

> **系统可以邀请意义产生，但不能追逐意义产生。**

> **AI 可以引导用户看见可能性，但不能引导用户走向结论。**

> **底层追求开放性，上层追求克制。**

> **宽观察，严证据，少呈现。**

> **Attention Capture → Attention Return.**
