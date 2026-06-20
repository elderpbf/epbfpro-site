/* Mock Review Kit · manifesto — Tela de LOGIN do /trilha (entrada, agnóstica de turma)
   Três direções pra tela única que decide como o aluno entra:
     - 1 turma salva no aparelho  -> encaminha DIRETO (não mostra a tela; flash "acesso
       válido", idealmente instantâneo). Botão de estado "1 ↪" simula isso.
     - 2+ turmas salvas           -> mostra o hub "minhas turmas".
     - 0 salvas                   -> só os caminhos de entrada (código de turma + e-mail
       OTP de 4 letras); validando o e-mail com 2+ turmas, mostra as opções.
   Cada mock tem um seletor de estado (0 / 1 / 2+) no canto pra você ver os três casos.
   Estética herdada do a1 (parede de cadastro de dentro da trilha): tokens reais,
   light/dark, header PensoIA. Teste todas as larguras no F12. */
window.REVIEW_MANIFEST = {
  title: 'Trilha · Tela de login (/trilha)',
  storageKey: 'mockrev_trilhalogin_ratings_v1',
  notesKey:   'mockrev_trilhalogin_notes_v1',
  rows: [
    { label: 'Direções (tela de login do /trilha)', items: [
      { id: 'a', file: 'a.html', label: 'A · Launcher (hub primeiro)' },
      { id: 'b', file: 'b.html', label: 'B · Dois caminhos' },
      { id: 'c', file: 'c.html', label: 'C · Mínimo (código em foco)' }
    ]},
    { label: 'Revisão 2 · entra na última turma, 2 campos sempre abertos (sem hub)', items: [
      { id: 'd', file: 'd.html', label: 'D · Faixa "Continuar" + 2 campos' },
      { id: 'e', file: 'e.html', label: 'E · 2 campos no foco + continuar discreto' }
    ]}
  ]
};
