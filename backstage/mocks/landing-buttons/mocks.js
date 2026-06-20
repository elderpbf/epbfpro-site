/* Mock Review Kit · manifesto — Botões do header do landing (pensoia.com)
   Reorganiza o set de botões pra os três casarem, com o header real (landing.css):
     - Área do Aluno  -> botão ROTULADO (não só ícone), copy de ação.
     - Conversar      -> CTA com propósito explícito.
     - Entrar Codex   -> SAI do header (era o ícone fora do padrão / confunde aluno);
       acesso escondido de 3 jeitos (um por variante). A auth Google segue como portão.
   Clique no ☀ pra alternar claro/escuro. Na variante C, 3 cliques no logo demonstram
   a entrada secreta do Codex. */
window.REVIEW_MANIFEST = {
  title: 'Landing · Set de botões do header',
  storageKey: 'mockrev_landingbtns_ratings_v1',
  notesKey:   'mockrev_landingbtns_notes_v1',
  rows: [
    { label: 'Direções (header do landing)', items: [
      { id: 'a', file: 'a.html', label: 'A · Pílulas rotuladas (+ Codex por e-mail)' },
      { id: 'b', file: 'b.html', label: 'B · Copy direta (+ Codex bookmark)' },
      { id: 'c', file: 'c.html', label: 'C · Enxuto (+ Codex logo secreto)' }
    ]},
    { label: 'Revisão 2 · botões iguais + idioma colapsado', items: [
      { id: 'd', file: 'd.html', label: 'D · Acessar minha trilha + Contato · idioma = globo' },
      { id: 'e', file: 'e.html', label: 'E · idem · idioma = pill "PT ▾"' }
    ]}
  ]
};
