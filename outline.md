# The Reactor — talk outline

A 20-minute walk through Powerhouse's local-first document runtime, told almost entirely in
diagrams. This file is the single source of truth for the deck: `bin/build.mjs` turns every
`###` heading below into one slide (its first `img/` image becomes the slide; its bullets become
speaker notes, visible in reveal's speaker view via `S`). `##` headings are structure for the
reader and produce no slides. Edit here, then `npm run build`.

Source material: the two published deep dives and the in-progress third
(Medium: "Document Models and The Reactor", "Reconciling local-first event streams",
"Optimizing distributed synchronization"). Nothing below goes beyond what those say; the gaps
are flagged at the end.

The argument of the talk: three requirements (local-first, append-only, signed intent) are
non-negotiable, and every design choice that follows is forced by them. State the requirements
early, score every alternative against them, and close on the same scorecard.

Timing target: 20 min total. Opening ≈ 2, Act I ≈ 4, Act II ≈ 3, Act III ≈ 8, Act IV ≈ 3.
Most slides are 30–60 s; the four reshuffle steps are one idea told in four frames and should
move fast.

---

## Opening (2 min)

### The Reactor

Local-first documents that sync.

- Who I am in one breath: hands-on technical lead; ~1 year at Powerhouse on this runtime.
- Powerhouse: local-first tooling for open organizations to coordinate people, code, and capital.
  Products on top: Achra (coordination hub), Vetra (data + workflows), identity, payments, an AI
  agent. All of it sits on the thing in this talk.
- The product stance that drives the engineering: agency and ownership for the user, without
  giving up the convenience of centralized SaaS. That sentence is the whole design constraint.
- Framing for a non-domain audience: think "git for structured documents, that also syncs live."

### The ask

![The Reactor runs everywhere and syncs](img/reactor-environments.png)

- Same runtime, everywhere: browser, Node server, CLI, mobile, edge, ETL. Data *and*
  execution live on the user's machine first; sync is eventually consistent.
- Two very different performance envelopes from one codebase: run serially without blocking a
  render thread in a browser, and scale horizontally on a server across many documents.
- Every one of these is a full peer — there is no privileged copy. That is not an implementation
  detail; it is the first of three requirements the whole design answers to.

### Three non-negotiables

![Local-first, append-only, signed intent: what each rules out and forces](img/design-constraints.png)

- This slide is the spine of the talk. Everything after it is a consequence.
- Requirement 1, local-first: data *and* execution on the user's machine, every peer
  authoritative, work continues offline. It rules out a privileged server copy that wins and
  reducers that only run server-side. It forces command sourcing (ship intent, replay locally),
  one runtime everywhere, and eventual consistency.
- Requirement 2, append-only: the operation log is a hash-chained audit trail on append-only
  backends (Swarm, Hypercore). History is never edited. Rules out reordering, rewriting, or
  deleting past operations. Forces new operations instead of edits, skip values with a
  garbage-collected view, and projections that rebuild from the log.
- Requirement 3, signed intent: every Action is signed by its author and must verify on every
  peer. Nobody's mutation may be altered by someone else. Rules out transforming other users'
  operations (OT) and silently discarding a peer's work. Forces replaying Actions verbatim,
  signature tiers that can bind state and order, and dead-lettering anything that fails
  verification.
- Why these are real and not self-imposed: the product promise is agency and ownership without
  giving up the convenience of centralized SaaS, for individuals, organizations, even countries.
  Ownership of data without ownership of execution is hollow (req 1). An audit trail you can
  quietly rewrite is not an audit trail (req 2). Ownership without proof of authorship is not
  ownership (req 3).
- Tell the audience: "keep the three colors in mind; I'll grade every alternative against them."

## Act I — Document Models (4 min)

### Where we started: the reducer

![Flux/Redux reducer loop](img/reducer-update-loop.png)

- If you know flux/redux you know this: a pure function takes state + a command and returns the
  next state. Every change is plain data plus a pure function: trivial to isolate and test.
- What flux papers over: (1) how do you reconstruct state you never had, (2) how do you sync
  state across users on append-only storage, (3) how does it scale. Two of those are
  requirements 1 and 2 knocking on the door.

### Event sourcing: state as a stream

![State as a stream of events](img/event-sourcing.png)

- Older idea than flux: don't store the object, store the stream of events that made it.
- Payoff: state at *any* point in time, with the reasons attached. Not just a username; the
  whole history of usernames and why each changed.
- This is requirement 2 turned into an asset: an append-only log isn't a constraint we tolerate,
  it's the data model. Auditability falls out for free.

### Aggregates: many views from one stream

![Folding a stream into an aggregate](img/event-sourcing-aggregates.png)

- Walk the stream with a `fold()` and you can build anything: a count, a table, an index.
- The killer property: you don't need to know which aggregates you'll want at launch. Ship,
  run for three years, then rebuild a brand-new view from the beginning of the stream.

### Command sourcing: store the intent, not the result

![Action stream reduced to states](img/action-stream-reducer.png)

- Our twist: we store the *command* (we call it an Action), not the event it produced.
- Why: requirement 1. Both the data and the execution must be locally owned, so each user's
  machine runs the reducer itself to get the resulting state. Storing results would put the
  execution somewhere else. This changes the shape of the reducer slightly.
- Bonus that pays off later: what we store is the signed Action (requirement 3), so the unit of
  storage is exactly the unit of authorship.

### The Document Model

![Document model: specification + reducer → PHDocument](img/document-model-architecture.png)

- Three parts: a state schema, an action schema, and a reducer that applies actions to state.
- Left: the spec. Author schema first; codegen gives you types, reducer stubs, and validation.
- Right: the reducer emits a PHDocument, which is the stream of Operations plus the state they
  produce. Operation = an applied Action plus metadata (ordinal, timestamp, hash). This
  Action-vs-Operation split is the hinge of Act III: the Action is the signed intent
  (requirement 3), the Operation is the result, and only one of them is sacred.
- Document Models are themselves documents: changing a schema is an action in an operation
  stream. Like git hosting its own source.

## Act II — The Reactor (3 min)

### The runtime: CQRS

![Reactor CQRS: write side, event bus, read side](img/reactor-cqrs.png)

- The Reactor is the management and execution runtime for Document Models. Requirement 1 says
  it has to run everywhere and be authoritative everywhere, so it has to be cheap in a browser
  and scalable on a server from one codebase.
- Reads and writes are separated so each side scales independently. The price is a little
  consistency: reads are asynchronous projections. Be upfront about that tradeoff.
- Write side: a queue feeds N executors that run the user-authored reducers. Reducers are pure,
  so executors are location-transparent: in-process, a worker, another process, another machine.
  In a browser, that's one executor cranking in serial.
- Middle: the event bus carries operations from writes to reads. In-memory in the browser; a
  real broker (e.g. RabbitMQ) is the plan for server deployments, not yet shipped.
- Read side: a coordinator hands `Operation[]` to read models. Read models are aggregates,
  CQRS-flavored.

### A read model: DocumentView

![DocumentView projects operations into a Postgres table](img/read-model.png)

- Built-in read model: folds the stream into a "latest state per document" Postgres table.
- Because it's decoupled, the authoritative op store can be arbitrarily slow ("the slowest
  blockchain on the moon") and reads stay fast.
- Another built-in, DocumentIndexer, filters relational operations to build a graph of
  document relationships for fast traversal.

### Read models don't care where they write

![Analytics read model into a time-series DB](img/analytics-read-model.png)

- Analytics read model: what changed, how, and why, into a completely separate time-series
  database. The Reactor doesn't care what a read model does with the stream.

## Act III — Sync: reconciling event streams (8 min)

#### The ask, restated (no slide)

- (No slide; say it over the previous one or the next.) Users want to see each other's work
  as close to real time as possible, and keep working when the network drops. Web, CLI,
  mobile: every peer authoritative, nobody's work discarded.
- Structure of this act: three known approaches, each graded against the three requirements
  plus one product requirement (users author arbitrary reducers, so order-dependent logic must
  work). Then the one that passes.

### How games do it

![Client/server game timelines](img/game-timelines.png)

- My background is games; multiplayer was local-first before it was cool.
- Local simulation runs optimistically and slightly ahead; an authoritative server simulation
  wins and the client reconciles. That's why you get shot around corners.
- It's a continuum (Animal Crossing loose, Counter-Strike strict), but always one privileged
  simulation.
- Grade: fails requirement 1 (one privileged copy) and requirement 3 (the server stomps client
  work; nobody consented to that). Passes "any reducer": a game simulation is arbitrary logic.

### How Figma does it: CRDTs

![CRDT commutativity with max()](img/crdt-max-operations.png)

- Conflict-free replicated data types: local-first, eventually consistent. Two clients apply
  `max(x,5)` and `max(x,6)` in either order and converge on 6.
- Grade so far: passes requirements 1, 2 and 3 cleanly. Ops are applied as-is, nobody's intent
  is touched, nothing is rewritten. Sounds perfect for us.

### Where CRDTs stop

![Reducer with a balance check diverges](img/crdt-withdraw-divergence.png)

- CRDTs don't generalize like reducers do. A balance check (`if balance >= amount`) is
  order-dependent by design. Apply the two withdrawals in different orders and the clients
  disagree forever.
- Thank God your bank doesn't use CRDTs. Also: they're tricky primitives to hand to every
  developer authoring a Document Model.
- Grade: fails the reducer requirement. Document Models are user-authored, and order-dependent
  logic like a balance check is the normal case, not the edge case. We can't ask every author to
  prove commutativity. So we lean on the architecture we already have.

### Back to the stream: interleave by timestamp

![Two action streams interleaved by timestamp](img/action-stream-interleaving.png)

- Two Reactors, one document, two operation streams. The obvious move: interleave by timestamp.
- Each Operation carries the Action, an ordinal, a timestamp, and a hash of the resulting state.

### Why you can't just interleave

![Interleaving breaks the state-hash chain](img/interleaving-breaks-hashes.png)

- Operations are immutable and hash-chained. Reordering means rewriting every operation after
  the first mismatch: this is Operational Transformation territory (Google Docs).
- Two objections, and they are exactly requirements 3 and 2. Semantic: do you want *your*
  mutations rewritten by someone else, on a sensitive document, and who decides? A transformed
  operation no longer matches its author's signature. Physical: our storage backends are
  append-only (Swarm, Hypercore); we literally cannot go back and rewrite.
- Grade: OT fails requirement 2 and requirement 3 outright, is usually server-mediated (weak on
  requirement 1), and transforms are notoriously hard to generalize.

### The scorecard

![Authoritative server, CRDTs, OT and Reshuffle graded against the requirements](img/sync-scorecard.png)

- Three known approaches, each with a well-known product behind it, each failing at least one
  non-negotiable. That is the case for building something: not novelty for its own sake, but
  no off-the-shelf approach satisfies all three requirements plus arbitrary reducers.
- Read the bottom row as a spec, not a boast: every Reactor reshuffles (req 1); new operations
  plus skip, nothing edited (req 2); Actions replayed verbatim (req 3); replay in order so
  order-dependent reducers work, with state-bound signatures for the cases where even reordering
  is unacceptable.
- The next five slides show how the bottom row is earned.

### Operational Reshuffle, step 1: sort

![Sort mixed A+B operations by timestamp](img/ops-sorted-by-timestamp.png)

- Two rules make the whole scheme work, and they are requirements 2 and 3 restated as
  mechanics. (1) Operations can't change, but we can create new ones; command sourcing gives us
  that freedom as long as projections end up the same. (2) We never rewrite intent: new
  Operations, never new Actions. That's the difference from OT.
- Step 1: take streams A and B and order by timestamp.

### Step 2: find the merge base

![Merge base and the conflicted range](img/merge-base-highlighted.png)

- Walk from the start; matching hashes mean the same operation. The first place A expects one
  thing and the merged order needs another is the divergence point: the merge base, in git terms.
- Here: 9 operations in conflict, 4 already in A, 5 from B.

### Step 3: replay from the merge base

![Replay actions in timestamp order as new operations](img/reshuffled-new-ops.png)

- Re-run the 9 *Actions* in timestamp order on top of the merge base, producing 9 *new*
  Operations. Same timestamps, new hashes: reducer results can change with order, and the
  ordinal is part of the hash.
- The Action signatures are untouched. The user's intent did not change. Requirement 3 holds
  through the merge without any special casing: the thing we signed is the thing we replay.

### Step 4: skip, then garbage-collect

![Skip value and the garbage-collected stream](img/skip-value-gc-stream.png)

- The 4 stale ops are already in append-only storage. Requirement 2 says we can't delete them,
  so the first new operation carries `skip=4`: projections ignore the preceding four. The skip
  value is the whole cost of honoring append-only, and it is one integer.
- The stream with skipped ops removed is the garbage-collected stream, A′. Most projections use
  it, but event sourcing means a projection could just as well count skipped ops.

### Both sides converge

![Bidirectional sync: A′ = B′](img/bidirectional-sync.png)

- Run the same procedure on both peers, exchanging reshuffled ops, and A′ equals B′. Repeat as
  each side keeps working (ping-pong; appendix slide if asked).

### When reordering intent is itself unacceptable

![Payload-only vs payload + input-state-hash signatures](img/signature-binding.png)

- Example: several parties sign a statement; if the statement changes, signatures must reset.
  We can sync the stream consistently and still break the reducer's semantic guarantee.
- So the Action signature is tiered. Default: sign the payload only (survives reshuffle).
  High security: also sign a hash of the input state, so the action only applies against that
  exact state. Critical: add the previous Operation id, which rejects on *any* reshuffle or
  state change (appendix slide).
- Net: reshuffle preserves intent by default and can optionally pin resulting state too. This
  is requirement 3 at full strength: the signature decides what "my intent" even means, and the
  protocol has no way to override it.

## Act IV — Over the network (3 min)

### Channels and mailboxes

![Inbox, outbox, dead-letter mailboxes between two Reactors](img/channel-mailbox-breakdown.png)

- A channel connects two Reactors; each side has three FIFO mailboxes. Outbox: what I'm
  pushing. Inbox: what I've received. Dead letter: operations that failed unrecoverably (bad
  signature, hash mismatch) and must not be retried. The dead letter box is where requirement 3
  is enforced on the wire: a bad signature never enters the log.
- Ordinals: every operation a Reactor emits gets a locally monotonic integer, a total order over
  everything that Reactor has ever seen, across all documents. Not global: two Reactors will
  have different ordinals for the same operation.

### The entire sync state is four integers

![Sync cursors: inbox/outbox × ack/latest](img/sync-cursors.png)

- Per channel: inbox.ack (highest remote ordinal durably applied), inbox.latest (highest seen),
  outbox.ack (highest local ordinal the remote has durably applied), outbox.latest (highest
  local ordinal produced that matches the filter).
- Three properties: ack ≤ latest; cursors only ever increase (no message, failure, or retry
  moves one backwards); "synced" means ack == latest in both directions.
- Resilience falls out: lost reply → re-poll with the same cursors, the remote resends
  everything after ack. Duplicate push → dedupe by action id (the Action is the immutable
  signed intent, so requirement 3 hands us idempotency for free; reapplying is a no-op). Process crash → read two cursors from storage and resume; the
  mailboxes rebuild themselves.
- Distributed-systems words: delivery at-least-once, application idempotent, progress monotonic.

### One poll, both directions

![Poll request carries data one way and acks the other](img/poll-piggyback-acks.png)

- Optimizations. Acks piggyback on polls: no separate ack request. My poll carries my inbox
  cursors (acking your outbox); your response carries your ack ordinal (acking mine).
- Writes are buffered in the outbox for a short window or max batch size, but batches must
  respect dependencies. Example: creating a document is CREATE_DOCUMENT + UPDATE_DOCUMENT
  submitted as one atomic batch, because the UPDATE casts the document to a model type and
  version. (Bonus: shipping a new model version is just another UPDATE_DOCUMENT.)
- Polling, not WebSockets, for now. Fine for our use cases; you wouldn't build Counter-Strike
  on it.
- At-least-once, not exactly-once: duplicates-plus-dedup beat a distributed transaction scheme.
  Idempotency inside and outside the Reactor makes it safe.
- Debuggability: a channel inspector shows state, filter, and each mailbox; channels support
  pause, resume, flush, and manual poll, so a human (or an LLM with tool calls) can step sync
  one message at a time.

## Close (1 min)

### The case, restated

![Scorecard again](img/sync-scorecard.png)

- Same slide as before, now earned. Three requirements we would not trade: local-first,
  append-only, signed intent. Three well-known approaches, each breaking at least one. One
  design that keeps all three and still lets users write ordinary reducers.
- The costs, said plainly: reads are eventually consistent (CQRS); stale operations stay in
  storage forever behind a skip value; sync is at-least-once with dedup; timestamps order the
  merge. Those are the prices of the three requirements, and I'd pay them again.

### Thanks

Questions?

- Recap in one line each: documents are command-sourced streams; the runtime is CQRS so reads
  and writes scale apart; sync is reshuffle (new operations, never new intent); the wire
  protocol is four monotonic cursors.
- Invite the tradeoff conversation: consistency on the read side, polling vs push, at-least-once,
  timestamp ordering.

---

## Appendix slides (only if asked)

### Reactor job pipeline

![Reactor architecture: queue → executors → op log + event bus](img/reactor-architecture.png)

- Lower-level view of the write side: client mutations → queue → executors → operation log and
  event bus → read models.

### Critical-security signature

![Payload + input-state hash + previous operation id](img/critical-security-signature-binding.png)

- Signature over payload + H(state) + previous Operation id. The id is a composite that includes
  a monotonically increasing index, so this rejects on any reshuffle and any state change.
- Answers "what if the statement changes, then changes back": state hashes would match again;
  the operation id would not.

### Ping-pong: rounds of convergence

![Multiple rounds of bidirectional sync](img/ping-pong-sync.png)

- Round 1 converges to A′ = B′. B keeps working; round 2 converges to A″ = B″. Continues as
  needed.

### One-way sync

![Reactor A's reshuffled operations applied to B](img/one-way-sync.png)

- The simplest case: A reshuffles and B applies A's new operations onto its stream.

---

## Gaps to fill before the talk

The third deep dive is still a draft and the export I worked from was truncated. These points
are referenced by name in the draft but the detail is missing from my sources; fill them in
from memory or leave them for Q&A:

- "Touch-and-poll": what exactly a `touchChannel` does versus a poll, and when it fires.
- Filters: the draft describes them as per-dimension membership tests where an empty value means
  "no restriction", with an example of a CLI tool that should receive operations for
  everything. Which dimensions (document id, model type, branch, scope)?
- Buffering: how the outbox handles arbitrary dependencies between operations beyond the
  create/update example.
- "For next time": the draft ends on Physics being the bane of every distributed scheme; if you
  have the mathematical model teased at the end of part two, that's a strong discussion topic.
- A real screenshot of the Channel Inspector would make a better slide than the poll diagram.

## Likely discussion questions (15–20 min block)

Prepared prompts, not slides. Where the articles don't answer, that's noted so you're not
caught improvising.

- Are the three requirements real, or self-imposed? Answer from the product promise: ownership
  of data without ownership of execution is hollow; an audit trail you can rewrite isn't one;
  ownership without proof of authorship isn't ownership. Then admit which would be relaxed first
  if the product changed (probably strict append-only backends), and what that would buy.
- Why not CRDTs plus an escape hatch for the order-dependent cases? The honest answer from the
  articles: reducers are user-authored, and order dependence is the common case, so the escape
  hatch would be the main road.
- Timestamps: reshuffle orders by client timestamps. What about clock skew, or a malicious
  client backdating actions? (Not addressed in the articles; the state-bound signature tiers
  are part of the answer for high-stakes documents.)
- Consistency: how stale can a read model be, and how does a UI know? (CQRS tradeoff is
  acknowledged in part one; subscriptions exist per part two's intro.)
- Growth: skipped operations stay in append-only storage forever. Storage growth, snapshotting,
  compaction?
- Executor location transparency: what actually ships today (worker? separate process?) versus
  the design.
- Event bus on servers: RabbitMQ is stated as intended, not deployed. What's the interim?
- Why polling over WebSockets, and what latency users actually see.
- Why not exactly-once: the dedup-by-action-id argument.
- Reducer authoring: how do you keep user-authored reducers pure and deterministic across
  peers (same input, same hash)? Codegen and validation from the schema are part one's answer.
- Testing a sync protocol: the pause/resume/flush/manual-poll channel controls, and using an
  LLM to step through sync issues.
- What you'd change: be ready with one honest answer.
