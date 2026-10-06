# reactor-talk

A reveal.js deck for "The Reactor" talk. Speaker notes live in the deck (press `S`).

## Layout

- `outline.md` is the **source of truth**. Each `###` is a slide; the enclosing `##` is the
  section label shown in the header band; `- bullets` become speaker notes.
- `docs/` is the static site GitHub Pages serves (from `main`). `docs/index.html` is
  **generated** — never hand-edit it. Run `npm run build` after editing `outline.md`.
- Diagrams are not authored here. They live in the sibling repo `../ph-diagrams` as standalone
  HTML pages, and the build copies the ones this deck uses into `docs/diagrams/`. A slide's
  `![alt](img/<id>.png)` names `../ph-diagrams/pages/<id>.html` — the `.png` spelling is
  legacy, no PNG is read.
- Screenshots and other binary assets embedded by diagram pages live in
  `../ph-diagrams/pages/assets/`; the build copies and prunes that directory.

## Always commit

**Commit after every set of changes, without waiting to be asked.** This applies to both
`reactor-talk` and the sibling `../ph-diagrams` repo — a change to a diagram usually touches
both, and committing only one leaves the pair inconsistent.

- Commit each repo separately, with a message describing that repo's part of the change.
- `ph-diagrams` first (the source), then `reactor-talk` (which contains the built copies).
- Run `npm run build` before committing `reactor-talk`, so the generated `docs/index.html` and the
  copied `docs/diagrams/` contents match `outline.md`.
- More than one agent may be working in these repos at once. Check `git status` before
  committing and don't sweep up unrelated in-progress work without saying so.

## Speaker notes

Text supplied for a slide goes into `outline.md` verbatim — do not reword it, and do not invent
notes for a slide that has none.
