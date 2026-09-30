# Publicando no itch.io

O jogo é um pacote estático (HTML, CSS e JS) sem servidor próprio. Os jogadores se conectam direto pelo navegador via WebRTC, com sinalização por relays Nostr públicos.

## 1. Gerar o pacote

```bash
bun install
bun run build
bun run package
```

- `bun run build` verifica os tipos com `tsc` e gera a pasta `dist/`. Se houver erro de TypeScript, o comando falha e nenhum build é gerado.
- `bun run package` compacta o conteúdo de `dist/` em `code-whispers-<versão>.zip` na raiz do projeto, com o `index.html` na raiz do zip. A versão vem do campo `version` do `package.json`.

Para publicar uma versão nova, atualize o `version` no `package.json` antes de rodar os comandos.

## 2. Configurar o projeto no itch.io

Em **Create new project** (ou **Edit game**, se o projeto já existir):

| Campo | Valor |
|-------|-------|
| Kind of project | **HTML** |
| Uploads | o arquivo `code-whispers-<versão>.zip`, marcado como **This file will be played in the browser** |
| Embed options | **Embed in page** |
| Viewport dimensions | **1024 × 768** |
| Mobile friendly | desmarcado |
| Automatically start on page load | marcado |
| Fullscreen button | marcado |
| Enable scrollbars | marcado |
| SharedArrayBuffer support | desmarcado |
| Multiplayer support | **Ad-hoc networked multiplayer**, de 2 a 8 jogadores |

Salve e abra a página do jogo.

## 3. Conferir a publicação

1. Abra a página do jogo com o DevTools aberto na aba Console. O jogo deve carregar sem erros.
2. Em outro navegador ou dispositivo, de preferência em outra rede, abra a mesma página.
3. Crie uma sala de **Duelo** em um lado, entre com o código no outro e jogue uma partida **Rápida (3)** até o resumo.
4. Crie uma sala de **Telefone sem fio** e entre com pelo menos mais dois navegadores. Jogue até o fim da revelação e volte para a sala de espera.

Se a conexão não acontecer, confira se algum relay da lista `NOSTR_RELAY_URLS` em `src/network/room.ts` saiu do ar e troque a URL por outra que funcione.
