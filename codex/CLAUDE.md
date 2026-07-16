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
