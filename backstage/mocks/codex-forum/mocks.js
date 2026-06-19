/* Mock Review Kit · manifesto — Codex: dossiê tabbed + sino + fórum admin
   Lote fiel (refeito): copia o shell real e muda só o delta.
   Dossiê = 1 (só o delta), sino = S2 corrigido, fórum = A vs B.
   (a 1ª leva, reconstruída/rejeitada, está em archive/) */
window.REVIEW_MANIFEST = {
  title: 'Codex · Dossiê tabbed + Sino + Fórum admin',
  storageKey: 'mockrev_codexforum_ratings_v2',
  notesKey:   'mockrev_codexforum_notes_v2',
  rows: [
    { label: 'Dossiê', items: [
      { id: 'dossie', file: 'dossie.html', label: 'Dossiê tabbed' }
    ]},
    { label: 'Sino', items: [
      { id: 'sino', file: 'sino.html', label: 'Sino · agrupado' }
    ]},
    { label: 'Fórum admin', items: [
      { id: 'forum-a', file: 'forum-a.html', label: 'A · 2 painéis' },
      { id: 'forum-b', file: 'forum-b.html', label: 'B · coluna + overlay' }
    ]}
  ]
};
