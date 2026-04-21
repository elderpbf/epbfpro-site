// ABNT2 finger-return drill content. One entry per shifted-number-row/punct symbol.
// Populated in task 1I. Level 3-5 content is short pt-BR; level 1-2 patterns are
// synthesized from `anchor` + `baseKey` + `char` by sources/symbols.js.

export const SYMBOLS = [
  {
    char: '!', anchor: 'a', baseKey: '1',
    wordsL3: ['oba!', 'vai!', 'sim!', 'ei!', 'olá!', 'venha!', 'vamos!', 'parabéns!', 'ótimo!', 'pronto!'],
    phrasesL4: [
      'Vamos lá agora!',
      'Ele gritou: olá!',
      'Aqui estamos!',
      'Cuidado na rua!',
      'Que ótimo dia!'
    ],
    paragraphsL5: [
      'Hoje é um bom dia! Vamos caminhar no parque. Depois podemos tomar um café!',
      'Parabéns pela sua vitória! Você trabalhou duro e conseguiu. Continue assim!'
    ]
  },
  {
    char: '@', anchor: 's', baseKey: '2',
    wordsL3: ['ana@me', 'foo@bar', 'user@site', 'a@b', 'x@y', 'm@n', 'p@r', 'k@l', 'n@o', 't@s'],
    phrasesL4: [
      'Envie para ana@me.',
      'O email é foo@bar.',
      'Contato: x@y.',
      'Use user@site.',
      'Peça a m@n.'
    ],
    paragraphsL5: [
      'O endereço é foo@bar e deve ser confirmado. Responda até amanhã. Obrigado pela atenção.',
      'Envie o arquivo para user@site logo cedo. A equipe aguarda. Depois reporte no grupo.'
    ]
  },
  {
    char: '#', anchor: 'd', baseKey: '3',
    wordsL3: ['#dev', '#ia', '#js', '#css', '#html', '#tag', '#foo', '#bar', '#br', '#go'],
    phrasesL4: [
      'Marque com #tag.',
      'Eu uso #dev.',
      'Poste com #ia.',
      'Siga a #css.',
      'Adicione #html.'
    ],
    paragraphsL5: [
      'Use a tag #dev para separar. Depois publique no canal. Assim a busca fica fácil.',
      'A hashtag #ia ajuda a organizar. Ela liga posts relacionados. Todos veem o fluxo.'
    ]
  },
  {
    char: '$', anchor: 'f', baseKey: '4',
    wordsL3: ['R$100', 'R$50', 'R$25', 'R$10', '$1', '$2', '$3', '$x', '$y', '$z'],
    phrasesL4: [
      'Custa R$100 a peça.',
      'São R$50 no total.',
      'Paguei R$10 por isso.',
      'Desconto de R$25.',
      'Saldo: $x no relatório.'
    ],
    paragraphsL5: [
      'O total deu R$100 na conta. Pagamos em dinheiro. Sobrou troco de R$5.',
      'A peça custa R$50 hoje. Amanhã sobe para R$60. Vale comprar agora mesmo.'
    ]
  },
  {
    char: '%', anchor: 'f', baseKey: '5',
    wordsL3: ['100%', '50%', '25%', '10%', '90%', '5%', '1%', 'a%b', 'x%y', 'z%w'],
    phrasesL4: [
      'O desconto é 25%.',
      'Atingimos 100% da meta.',
      'Faltam 10% apenas.',
      'Só 5% terminaram hoje.',
      'Melhoramos 90% este mês.'
    ],
    paragraphsL5: [
      'A equipe bateu 100% da meta. O desconto foi de 10%. Todos ficaram felizes com o resultado.',
      'Apenas 5% dos alunos falharam. Os outros 95% passaram. A média subiu muito este semestre.'
    ]
  },
  {
    char: '&', anchor: 'j', baseKey: '7',
    wordsL3: ['A&B', 'X&Y', 'P&Q', 'R&D', 'Q&A', 'T&D', 'N&R', 'B&B', 'M&M', 'D&D'],
    phrasesL4: [
      'Fomos ao A&B hoje.',
      'A marca X&Y cresceu.',
      'Abrimos um Q&A rápido.',
      'O R&D investiu mais.',
      'O time T&D subiu junto.'
    ],
    paragraphsL5: [
      'A empresa A&B lidera o setor. Investe em R&D e cresce. O Q&A esclarece dúvidas dos clientes.',
      'O time X&Y venceu a final. Foram meses de M&M no treino. Todos comemoraram juntos a conquista.'
    ]
  },
  {
    char: '*', anchor: 'k', baseKey: '8',
    wordsL3: ['*nota', '*ver', '*ok', '*sim', '*ei', '*ir', '*lê', '*vá', '*cá', '*já'],
    phrasesL4: [
      'Veja a *nota abaixo.',
      'Marquei com *ok aqui.',
      'Leia a *lê antes.',
      'Aguarde o *sim dele.',
      'Chegue já *cá agora.'
    ],
    paragraphsL5: [
      'A *nota final foi revisada. Consulte o *ver para detalhes. Assim fica tudo certo na entrega.',
      'Coloque um *ok ao lado. Depois marque o *sim. Por fim, arquive a lista completa.'
    ]
  },
  {
    char: '(', anchor: 'l', baseKey: '9',
    wordsL3: ['(ok)', '(sim)', '(não)', '(ver)', '(fim)', '(vem)', '(vai)', '(sei)', '(ora)', '(ei)'],
    phrasesL4: [
      'Ele disse (ok) logo.',
      'Vou (ver) depois agora.',
      'Chegou ao (fim) rápido.',
      'Marcou (sim) bem claro.',
      'Tudo (ok) por aqui.'
    ],
    paragraphsL5: [
      'A resposta foi (sim) clara. Agora vamos (ver) o próximo passo. Assim chegamos ao (fim) juntos.',
      'Ele disse (ok) rapidamente. Todos entenderam o recado. O projeto seguiu (ok) até hoje.'
    ]
  },
  {
    char: ')', anchor: 'ç', baseKey: '0',
    wordsL3: ['ok)', 'sim)', 'vai)', 'fim)', 'ver)', 'vem)', 'sei)', 'ora)', 'ei)', 'lê)'],
    phrasesL4: [
      'Cheguei ao (fim) agora.',
      'Confirme (ok) por favor.',
      'Diga (sim) bem claro.',
      'Aguarde (vem) logo mais.',
      'Por (ora) basta disso.'
    ],
    paragraphsL5: [
      'O resultado (ok) foi positivo. Depois virá outro teste. Tudo dentro do plano (ok).',
      'A equipe disse (sim) rápido. O prazo é curto mas factível. Chegaremos ao (fim) juntos.'
    ]
  },
  {
    char: '_', anchor: 'ç', baseKey: '-',
    wordsL3: ['a_b', 'x_y', 'foo_bar', 'nome_id', 'key_val', 'm_n', 'p_q', 'n_1', 'k_2', 'r_3'],
    phrasesL4: [
      'Use a_b no código.',
      'O id é nome_id.',
      'Armazene em key_val.',
      'Chame foo_bar depois.',
      'Renomeie m_n agora.'
    ],
    paragraphsL5: [
      'O padrão nome_id foi adotado. Todos os campos seguem a convenção. Facilita a leitura do código.',
      'A função foo_bar retorna nada. Ela é usada como callback. Evite trocar por outra agora.'
    ]
  },
  {
    char: '+', anchor: 'ç', baseKey: '=',
    wordsL3: ['1+1', '2+2', 'a+b', 'x+y', '1+2', '3+4', '5+6', '7+8', 'm+n', 'p+q'],
    phrasesL4: [
      'O total é 2+2 aqui.',
      'Some a+b e retorne.',
      'Faça 5+6 bem rápido.',
      'Calcule x+y agora.',
      'Resolva 1+1 primeiro.'
    ],
    paragraphsL5: [
      'A conta 2+2 dá quatro. Simples assim, sem truques. Crianças aprendem rápido esse cálculo.',
      'O total fica a+b no final. Basta somar os termos. O resultado aparece logo na tela.'
    ]
  },
  {
    char: '<', anchor: 'k', baseKey: ',',
    wordsL3: ['a<b', 'x<y', '1<2', '<br>', '<p>', '<a>', '<h1>', '<div>', '<li>', '<ul>'],
    phrasesL4: [
      'Use <br> aqui rápido.',
      'O texto em <p>.',
      'Abra um <div> agora.',
      'Cite com <a> externo.',
      'Liste em <li> depois.'
    ],
    paragraphsL5: [
      'O HTML usa <p> para parágrafo. Já <div> agrupa blocos. Cada tag tem um papel claro no layout.',
      'A condição a<b verifica o menor. Se verdadeira, execute o bloco. Caso contrário, siga adiante.'
    ]
  },
  {
    char: '>', anchor: 'l', baseKey: '.',
    wordsL3: ['a>b', 'x>y', '1>2', '<br>', '<p>', '</p>', '=>', '->', '>1', '>x'],
    phrasesL4: [
      'A regra é a>b hoje.',
      'Feche com </p> sempre.',
      'Fluxo: a => b simples.',
      'Use a setinha -> bem.',
      'Valor >1 já passa.'
    ],
    paragraphsL5: [
      'A tag </p> fecha o parágrafo. Toda abertura precisa de fechamento. Sem exceção nesta regra.',
      'A seta => indica retorno curto. Callbacks breves usam muito. Fica limpo e direto de ler.'
    ]
  },
  {
    char: ':', anchor: 'ç', baseKey: ';',
    wordsL3: ['a:b', 'x:y', 'hora:12', 'foo:bar', 'key:val', 'm:n', 'p:q', '1:1', '2:2', '3:3'],
    phrasesL4: [
      'Use key:val assim aqui.',
      'São 12:30 agora mesmo.',
      'Marque hora:12 no mapa.',
      'Defina foo:bar depois.',
      'Liste a:b em ordem.'
    ],
    paragraphsL5: [
      'O formato key:val é comum. JSON usa muito esse padrão. Facilita o parseamento em qualquer linguagem.',
      'A reunião começa às 10:30. Todos já confirmaram presença. Leve a ata pronta para assinar.'
    ]
  },
  {
    char: '?', anchor: 'ç', baseKey: '/',
    wordsL3: ['ok?', 'sim?', 'não?', 'vai?', 'vem?', 'quem?', 'onde?', 'como?', 'qual?', 'por?'],
    phrasesL4: [
      'Tudo bem com você?',
      'Você vai hoje mesmo?',
      'Qual o prazo final?',
      'Onde fica isso mesmo?',
      'Como chegar lá rápido?'
    ],
    paragraphsL5: [
      'Você vai à reunião? O horário ainda vale hoje. Confirme até o meio-dia, ok?',
      'Qual o seu plano? Pode ser flexível ou fixo agora. Me avise o que prefere, sim?'
    ]
  },
  {
    char: '"', anchor: 'ç', baseKey: "'",
    wordsL3: ['"oi"', '"ok"', '"sim"', '"não"', '"ei"', '"ir"', '"fim"', '"vem"', '"vai"', '"bem"'],
    phrasesL4: [
      'Ele disse "olá" forte.',
      'Respondeu "sim" logo.',
      'Escreveu "fim" no fim.',
      'Ela falou "ok" baixo.',
      'Grita "vai" agora mesmo.'
    ],
    paragraphsL5: [
      'Ele respondeu "sim" sem pensar. A resposta pareceu sincera. Todos ficaram satisfeitos com o tom.',
      'Ela escreveu "fim" no caderno. A história acabou ali mesmo. Foi um bom encerramento para o livro.'
    ]
  }
];
