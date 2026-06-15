/* Mock Review Kit · manifesto (carregado como global p/ funcionar em file:// e http) */
window.REVIEW_MANIFEST = {
  title: 'PensoIA · Landing',
  storageKey: 'pso_carousel_ratings_v1',   // mesma chave do carrossel antigo: suas notas migram
  notesKey:   'pso_carousel_notes_v1',
  rows: [
    { label: 'A/B/C · rodada 1', items: [
      { id:'a1', file:'a1.html', label:'Aurora Ledger' },
      { id:'a2', file:'a2.html', label:'Bento Console' },
      { id:'a3', file:'a3.html', label:'Soft Horizon' },
      { id:'b1', file:'b1.html', label:'Dossiê Editorial' },
      { id:'b2', file:'b2.html', label:'Aurora / Ampliação' },
      { id:'b3', file:'b3.html', label:'Estúdio / Cream' },
      { id:'c1', file:'c1.html', label:'Editorial / Manifesto' },
      { id:'c2', file:'c2.html', label:'Dark Tech / Bento' },
      { id:'c3', file:'c3.html', label:'Split-Screen / Product' }
    ]},
    { label: 'D/E/F · rodada 2', items: [
      { id:'d1', file:'d1.html', label:'O Console', out:true },
      { id:'d2', file:'d2.html', label:'Um dia, ampliado' },
      { id:'d3', file:'d3.html', label:'O Mapa' },
      { id:'e1', file:'e1.html', label:'O Console', out:true },
      { id:'e2', file:'e2.html', label:'A Trilha' },
      { id:'e3', file:'e3.html', label:'A Mesa' },
      { id:'f1', file:'f1.html', label:'O Prompt', out:true },
      { id:'f2', file:'f2.html', label:'A Travessia' },
      { id:'f3', file:'f3.html', label:'A Bancada' }
    ]},
    { label: 'G–K · rodada 3 (paradigmas)', items: [
      { id:'g1', file:'g1.html', label:'Concierge' },
      { id:'g2', file:'g2.html', label:'A Mesa' },
      { id:'h1', file:'h1.html', label:'A Régua' },
      { id:'h2', file:'h2.html', label:'O Cronômetro' },
      { id:'i1', file:'i1.html', label:'Lúmen' },
      { id:'i2', file:'i2.html', label:'Aurora Fluida' },
      { id:'j1', file:'j1.html', label:'Dois Trilhos' },
      { id:'j2', file:'j2.html', label:'Cockpit' },
      { id:'k1', file:'k1.html', label:'Sala de Audiência' },
      { id:'k2', file:'k2.html', label:'O Amplificador' }
    ]},
    { label: 'L–O · rodada 4 (convergência)', items: [
      { id:'l1', file:'l1.html', label:'Jornada de Luz' },
      { id:'l2', file:'l2.html', label:'Painel · luz' },
      { id:'m1', file:'m1.html', label:'Painel · setor' },
      { id:'m2', file:'m2.html', label:'A Bancada' },
      { id:'n1', file:'n1.html', label:'A Constelação' },
      { id:'n2', file:'n2.html', label:'Mesa de Trabalho' },
      { id:'o1', file:'o1.html', label:'Constelação · luz' },
      { id:'o2', file:'o2.html', label:'A Trilha Viva' }
    ]},
    { label: 'P · minhas entradas (Claude)', items: [
      { id:'p1', file:'p1.html', label:'A Luz Calma' },
      { id:'p2', file:'p2.html', label:'A Luz · finalista' }
    ]},
    { label: 'Finale · só o fecho (luz revela contatos)', items: [
      { id:'fin1', file:'fin1.html', label:'v1 · Bloom' },
      { id:'fin2', file:'fin2.html', label:'v2 · Íris' },
      { id:'fin3', file:'fin3.html', label:'v3 · Partículas' }
    ]},
    { label: 'Orbe · trajetória (experimentos)', items: [
      { id:'orb1', file:'orb1.html', label:'v1 · Caneta' },
      { id:'orb2', file:'orb2.html', label:'v2 · Vaga-lume' }
    ]}
  ]
};
