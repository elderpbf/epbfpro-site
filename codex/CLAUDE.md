# Codex — guardrails de engenharia

Auto-carrega para qualquer sessão de código que trabalhe sob `codex/`.

## Superfície repetida é UM módulo parametrizado por escopo, nunca duas montagens

Quando a mesma superfície (a tabela de pessoas, o editor, um modal de ação) aparece em duas telas,
ela é um componente único que as duas telas MONTAM, e TODA ação (editar, remover, filtrar,
selecionar) mora dentro dele. Copiar a fiação de uma tela para a outra é proibido: extraia antes de
continuar. Uma ação que existe em duas cópias vai divergir, é questão de tempo.

Precedente (track-42): a tabela de pessoas é `codex/cohorts/person-table.js`, montada em escopo
`global` por `students.js` (Usuários) e em escopo `turma` por `cohorts.js` (dossiê Participantes). As
peças compartilhadas — lista, toolbar, filtros, editor — vivem em `codex/cohorts/*.js` e são usadas
por essa única montagem. O que diverge entre as telas é só o que a montagem recebe como parâmetro
(escopo, ações oferecidas, semântica de remoção), nunca código copiado.

## O modelo de PACOTE (item que contém itens)

Definido pelo Élder em 2026-08-06, depois de duas tentativas minhas que se contradiziam. As seis
regras são a lei; qualquer coisa que precise de uma sétima está errada.

1. **Todo item tem UM tipo de conteúdo, e um só.** Não existe "tipo de pasta convivendo com tipo de
   conteúdo": um Prompt dentro de um pacote continua sendo `prompt`, e por isso continua saindo cru
   no `.md`.
2. **Pacote é um item cujo tipo pertence à família `bundle`** (coluna `ct_types.family`, migração
   0050). `pasta` é o padrão, `projeto` é outro. Criar um tipo novo de pacote é uma caixinha na tela
   de tipos, não código.
3. **Só pacote tem membros.** Um item comum que ganha companhia **não vira pai**: cria-se um pacote
   novo que segura os dois. É a regra que mais gente (eu inclusive) tenta violar.
4. **Entre os membros existe só `indent`, e ele é EXIBIÇÃO.** Não há parentesco entre itens. Élder:
   *"o relacionamento pai-filho real só pertence ao bundle e seus itens; the items inside are just
   indented or not for organizational purposes"* e *"being a brother or a child makes no real world
   difference. it's just the way it'll show on the trail"*. Consequências que caem de graça: apagar
   um membro só PROMOVE quem estava recuado sob ele, não existe re-parentear, não existe validar
   consistência de árvore, e o ciclo só precisa ser checado entre pacotes.
5. **Pacote dentro de pacote: UM nível.** `CT_BUNDLE_MAX_NESTING = 1`. O recuo tem teto próprio,
   `MAX_INDENT` em `js/item-list.js`, espelhado por `CT_MEMBER_MAX_INDENT` no Worker.
6. **Um membro pode viver em vários pacotes.** Multi-parent é permitido de propósito.

Corolário que já custou trabalho jogado fora: **no `.zip`, só PACOTE vira pasta. Recuo não vira
pasta.** Recuo é exibição (regra 4), então mapeá-lo para diretório inventa hierarquia que não existe
em lugar nenhum do modelo.

O teto de recuo é UM número (`MAX_INDENT`), importado pelo editor e pela trilha, e o CSS deriva a
margem de `--cdx-in-step`. Se ficar apertado no telefone, o conserto é encolher o passo, nunca baixar
o teto: proibir estrutura para caber na tela resolve o problema errado.
