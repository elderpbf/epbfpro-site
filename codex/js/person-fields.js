// js/person-fields.js
// The shared validators/masks for a person's fields (track-28a2). Pure + DOM-light, so the turma
// Participantes panel and the Alunos roster validate and mask IDENTICALLY. These used to live
// privately inside cohorts.js, which meant a second surface could only get them by copying, the
// exact drift Élder called out.

export function emailValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}

// Brazilian CPF check digits.
export function cpfValid(cpf) {
  const s = String(cpf || '').replace(/\D/g, '');
  if (s.length !== 11 || /^(.)\1+$/.test(s)) return false;
  let sum = 0; for (let i = 0; i < 9; i++) sum += Number(s[i]) * (10 - i);
  let r = (sum * 10) % 11; if (r >= 10) r = 0;
  if (r !== Number(s[9])) return false;
  sum = 0; for (let i = 0; i < 10; i++) sum += Number(s[i]) * (11 - i);
  r = (sum * 10) % 11; if (r >= 10) r = 0;
  return r === Number(s[10]);
}

export function formatCpf(raw) {
  const v = String(raw || '').replace(/\D/g, '').slice(0, 11);
  if (v.length > 9) return v.slice(0, 3) + '.' + v.slice(3, 6) + '.' + v.slice(6, 9) + '-' + v.slice(9);
  if (v.length > 6) return v.slice(0, 3) + '.' + v.slice(3, 6) + '.' + v.slice(6);
  if (v.length > 3) return v.slice(0, 3) + '.' + v.slice(3);
  return v;
}

export function wireCpfMask(el) {
  if (!el) return;
  if (el.value) el.value = formatCpf(el.value);
  el.addEventListener('input', () => { el.value = formatCpf(el.value); });
}
