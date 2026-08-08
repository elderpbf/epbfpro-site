# Codex — engineering guardrails

Auto-loads for any coding session working under `codex/`.

## Everything in the repository is written in ENGLISH

Code, identifiers, comments, commit messages, docs, test names, and this file. No exceptions, and
being able to read Portuguese is not one: Élder is bilingual, which decides what language we *talk*
in, not what language the repository is written in (Élder, 2026-08-07: "the fact that I'm bilingual
doesn't mean that... all of the documentation, comments and coding needs to be fully in English").

The one thing that stays in Portuguese is **user-facing copy** — anything a student or an admin
reads on screen. Those strings live in `codex/i18n/*.js` and are reached through `t()`, never
hardcoded, which is what keeps the two rules from colliding.

Parts of this codebase still carry Portuguese comments from before this rule. They are a cleanup
debt, not a precedent: a file you touch gets its comments translated as you go, and no new
Portuguese comment gets written.

**Finding a breach is a mandate, not a report.** Fix it on the spot, whatever else you were doing,
then say you found it and fixed it. Never ask permission to enforce this.

## A repeated surface is ONE module parameterized by scope, never two mountings

When the same surface (the person table, the editor, an action modal) appears on two screens, it is
a single component that both screens MOUNT, and EVERY action (edit, remove, filter, select) lives
inside it. Copying wiring from one screen to the other is forbidden: extract first, then continue.
An action that exists in two copies will diverge; it is only a matter of time.

Precedent (track-42): the person table is `codex/cohorts/person-table.js`, mounted with scope
`global` by `students.js` (Users) and with scope `turma` by `cohorts.js` (Participants dossier). The
shared pieces — list, toolbar, filters, editor — live in `codex/cohorts/*.js` and feed that single
mounting. What differs between screens is only what the mounting receives as a parameter (scope,
offered actions, removal semantics), never copied code.

The same rule forbids monoliths: a screen large enough to need sections is a folder of modules with
one assembling mount, not one long file.

## The BUNDLE model (an item that contains items)

Defined by Élder on 2026-08-06, after two attempts of mine that contradicted each other. These six
rules are the law; anything that needs a seventh is wrong.

1. **Every item has ONE content type, and only one.** There is no "folder type coexisting with a
   content type": a Prompt inside a bundle is still a `prompt`, which is why it still downloads raw
   as `.md`.
2. **A bundle is an item whose type belongs to the `bundle` family** (`ct_types.family`, migration
   0050). `pasta` is the default, `projeto` is another. Creating a new bundle type is a checkbox on
   the types screen, not code.
3. **Only a bundle has members.** An ordinary item that gains company does **not** become a parent:
   a new bundle is created holding both. This is the rule most people (me included) try to violate.
4. **Between members there is only `indent`, and it is DISPLAY.** There is no parenthood between
   items. Élder: *"the real father-child relationship only pertains to the bundle and its items; the
   items inside are just indented or not for organizational purposes"* and *"being a brother or a
   child makes no real world difference. it's just the way it'll show on the trail"*. Consequences
   that fall out for free: deleting a member only PROMOTES whoever was indented under it, there is
   no re-parenting, there is no tree-consistency validation, and cycles only need checking between
   bundles.
5. **Bundle inside a bundle: ONE level.** `CT_BUNDLE_MAX_NESTING = 1`. Indent has its own cap,
   `MAX_INDENT` in `js/item-list.js`, mirrored by `CT_MEMBER_MAX_INDENT` in the Worker.
6. **A member can live in several bundles.** Multi-parent is allowed on purpose.

Indent moves in BLOCKS (Élder, 2026-08-07): changing a row's indent carries everything nested under
it by the same amount, and the move is refused whole when the block would not fit, rather than
applied halfway. That is `shiftIndent` in `js/item-list.js`.

A corollary that already cost thrown-away work: **in the `.zip`, only a BUNDLE becomes a folder.
Indent does not.** Indent is display (rule 4), so mapping it to a directory invents a hierarchy that
exists nowhere in the model.

The indent cap is ONE number (`MAX_INDENT`), imported by both the editor and the trail, and the CSS
derives its margin from `--cdx-in-step`. If it feels cramped on a phone, the fix is shrinking the
step, never lowering the cap: forbidding structure to fit a screen solves the wrong problem.

## Raw content is a FLAG on the item, not a guess from its type

`isVerbatim(item)` in `js/item-download.js` is the single source. It reads `meta.verbatim`, falling
back to `type === 'prompt'` for items that never chose — which is what keeps the existing corpus
behaving without a migration.

It used to be inferred from the type alone, and the AI's own guess about the type decided it. Élder,
2026-08-07: *"sometimes the AI takes as a prompt something that isn't, and then it doesn't format
it. It should format anyway, but if the type or the option doesn't allow it, then it shows the
original text."* So the AI always formats, both bodies are kept, and the flag picks which one wins.
