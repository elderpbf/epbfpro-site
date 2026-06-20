/* Mock Review Kit · manifesto — Tela de entrada / cadastro da Trilha
   3 direções pra tela que o visitante não-cadastrado vê: registro (nome+e-mail,
   link mágico) como porta única; perguntas ao vivo nunca travam; preview das aulas
   que VÃO acontecer (não o conteúdo, que pode nem estar liberado na 1ª aula) +
   benefícios do login. Linha de certificado só aparece se a turma emite. */
window.REVIEW_MANIFEST = {
  title: 'Trilha · Tela de entrada (cadastro)',
  storageKey: 'mockrev_trilhaentry_ratings_v1',
  notesKey:   'mockrev_trilhaentry_notes_v1',
  rows: [
    { label: 'Direção (registro em modal)', items: [
      { id: 'a1',  file: 'a1.html',        label: 'A · PC' },
      { id: 'a1m', file: 'a1-mobile.html', label: 'A · Mobile (compacto)' }
    ]},
    { label: 'Alternativas (referência)', items: [
      { id: 'a2', file: 'a2.html', label: 'B · Cadastro em foco' },
      { id: 'a3', file: 'a3.html', label: 'C · Jornada das aulas' }
    ]}
  ]
};
