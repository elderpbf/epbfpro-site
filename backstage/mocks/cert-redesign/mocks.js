/* Mock Review Kit · manifesto — cert-redesign
   Direção já decidida: Vetor é o favorito/padrão; aposentar os 4 modelos escuros
   (aurora, eclipse, holo, plate); manter o P como está; auto-fit do nome; UMA frase
   institucional (registro EJUSE); UM bloco de validação unificado. Estes mocks deixam
   você escolher a EXECUÇÃO antes de eu mexer no renderer real. */
window.REVIEW_MANIFEST = {
  title: 'PensoIA · Certificado — redesign',
  storageKey: 'mockrev_certredesign_ratings_v1',
  notesKey:   'mockrev_certredesign_notes_v1',
  rows: [
    { label: 'Vetor (favorito)', items: [
      { id: 'a1', file: 'a1.html', label: 'Vetor · validação card' },
      { id: 'a2', file: 'a2.html', label: 'Vetor · validação faixa' }
    ]},
    { label: 'Alternativos claros', items: [
      { id: 'a3', file: 'a3.html', label: 'Console · grade' },
      { id: 'a4', file: 'a4.html', label: 'Monograma · clássico' }
    ]}
  ]
};
