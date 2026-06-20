/* Mock Review Kit · manifesto — Tela de entrada / cadastro da Trilha
   Tela única RESPONSIVA que o visitante não-cadastrado vê: registro (nome+e-mail,
   link mágico) como porta única; perguntas ao vivo nunca travam; preview das aulas
   que VÃO acontecer (não o conteúdo, que pode nem estar liberado na 1ª aula) +
   benefícios do login. Linha de certificado só aparece se a turma emite.
   a1 = uma só tela; abra o F12 e teste todos os larguras (desktop → tablet → phone).
   A moldura de celular separada (a1-mobile) foi arquivada: virou redundante. */
window.REVIEW_MANIFEST = {
  title: 'Trilha · Tela de entrada (cadastro)',
  storageKey: 'mockrev_trilhaentry_ratings_v1',
  notesKey:   'mockrev_trilhaentry_notes_v1',
  rows: [
    { label: 'Direção (uma tela responsiva)', items: [
      { id: 'a1', file: 'a1.html', label: 'A · Responsiva' }
    ]},
    { label: 'Alternativas (referência)', items: [
      { id: 'a2', file: 'a2.html', label: 'B · Cadastro em foco' },
      { id: 'a3', file: 'a3.html', label: 'C · Jornada das aulas' }
    ]}
  ]
};
