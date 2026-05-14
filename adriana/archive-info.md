# Adriana, página convertida em retrospectiva

Em 2026-05-13 a página `/adriana` foi convertida de canal ativo de atualizações
para uma retrospectiva estática da jornada de recuperação de fevereiro a abril
de 2026.

## O que mudou

- A página pública não consulta mais Google Sheets nem Apps Script.
- Foram removidos do front-end: comentários/mural, push notifications,
  banner controlado pelo admin, flower shower, resumo glow, botão "deixar
  mensagem", barra de notificações, dark toggle e atualizações ao vivo.
- O conteúdo passou a ser inline: 6 fases narradas, galeria de fotos
  organizada por data, vídeo de encerramento, parágrafo de agradecimento.

## O que foi preservado

- `admin/` permanece em disco como arquivo histórico. Não é mais linkado da
  página pública.
- A planilha Google Sheets e o Apps Script seguem existindo, mas não são
  mais consumidos pelo site.
- `manifest.json`, `favicon-adriana.png` e a pasta `media/` permanecem.

## Manifest da família de projetos

Ver `PensoIA/Adriana-Updates/MANIFEST.md` para o histórico completo.
