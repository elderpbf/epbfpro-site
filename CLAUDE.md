# epbfpro-site — project notes for Claude

## Naming (do not slip)
Do **not** call the live-questions / perguntas feature "ClassPulse". That brand is
retired; it is part of **Codex** now (refer to it as "as perguntas ao vivo do Codex"
or just Codex). Internal identifiers keep their names for now with no user impact
(the `DB_CLASSPULSE` binding, `cp_*` helpers), so this is about how we *refer* to it
in conversation and in any host/student-facing copy, not a rename of the code. If a
user-facing "ClassPulse" string is ever found, replace it with Codex.
