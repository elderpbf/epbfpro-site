# Polling das perguntas ao vivo (Codex)

Referência objetiva de quando e com que frequência o aluno faz requisições ao Worker
durante as perguntas ao vivo. Não há websocket; tudo é polling. Fonte da verdade: os
arquivos citados. Atualize esta tabela quando mudar um intervalo.

## Intervalos

| Camada | Arquivo | Estado | Intervalo |
|---|---|---|---|
| Orquestrador da trilha | `codex/trilha/js/nexo.js` | sem sessão aberta (ocioso) | **8 s** (`POLL_IDLE_MS`) |
| Orquestrador da trilha | `codex/trilha/js/nexo.js` | sessão aberta | **15 s** (`POLL_LIVE_MS`) |
| Elemento da pergunta | `codex/questions/question-element.js` | pergunta ativa | **2 s** (`_pollInterval` padrão) |
| Inbox do aluno (Q&A) | `codex/trilha/js/nexo-answer.js` | sessão aberta | **4 s** (`inboxTimer`) |

O ocioso (8 s) é o que observa você clicar em **iniciar** (`cdx-host-start`) pra abrir a
sessão; por isso é mais frequente que o "aberto". O elemento da pergunta só existe/pinga
enquanto há sessão aberta.

## Pausas (economia de requisições)

- **Pausa por visibilidade** (`question-element.js`, `_handleVisibilityChange`): quando a
  aba fica escondida, o polling para; ao voltar a ficar visível, retoma. Não conta pings
  com a tela apagada / aba em segundo plano.
- **Pausa por inatividade** (`question-element.js`, modo `student`): passados **5 min**
  (`_pauseAfterMs`) sem pergunta ativa, o polling para e a tela mostra "toque para
  continuar". O aluno toca pra retomar.
- **Resgate por `pageshow`/`focus`** (`question-element.js`, `_handleResumeTrigger`):
  rede/celular às vezes congela a aba sem disparar `visibilitychange`; ao voltar, esses
  eventos forçam uma busca imediata da pergunta atual (evita ter que dar refresh).

## Decisões

- Ocioso mantido em 8 s (Élder, 2026-07): não reduzir por ora.
- Ativo baixado de 3 s → 2 s (Élder, 2026-07): resposta mais rápida entre perguntas.
