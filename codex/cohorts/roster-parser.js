// cohorts/roster-parser.js
// Pure helper for parsing bulk-import participant lines.
//
// parseRosterLines(text) -> rows[]
//
// Each non-blank line is parsed as:
//   "Name, email@example.com, 000.000.000-00"
//   "Name, 000.000.000-00, email@example.com"  (order-tolerant for cpf vs email)
//   "Name"
//
// Rules:
//   - Split on commas; trim every field.
//   - First field is always the name (required; blank lines skipped).
//   - Remaining fields: if it looks like an email (contains @) -> email (first wins);
//     otherwise treated as cpf (first non-email non-name field wins).
//   - A field that is neither a valid-looking email nor a plausible name becomes cpf.
//   - Malformed email (contains @ but no dot after @): kept as email anyway — lenient.
//   - Blank lines silently skipped.
//   - Name-only lines are valid rows.

const EMAIL_RE = /@/; // lenient: any token containing @ is treated as an email

export function parseRosterLines(text) {
  if (!text) return [];
  const rows = [];
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    // Split on commas and trim each field, preserving positional meaning.
    // The FIRST field is always the name; empty name = skip line.
    const parts = line.split(',').map((p) => p.trim());
    const name = parts[0];
    if (!name) continue; // empty first field = no name = skip

    let email = null;
    let cpf = null;

    for (let i = 1; i < parts.length; i++) {
      const field = parts[i];
      if (!field) continue; // skip empty comma-separated slots
      if (EMAIL_RE.test(field)) {
        if (email === null) email = field; // first email-looking field wins
      } else {
        if (cpf === null) cpf = field; // first non-email extra field wins
      }
    }

    rows.push({ name, email: email || null, cpf: cpf || null });
  }
  return rows;
}
