# Code Whispers

Jogo para duas pessoas praticarem leitura de código. A cada rodada, cada jogador escreve um trecho de código, explica o trecho que recebeu do oponente e avalia a explicação que recebeu sobre o próprio código: **Errou**, **Meio Certo** ou **Correto**.

Roda inteiro no navegador. Não tem servidor nem cadastro: um jogador cria a sala, compartilha o código de 6 letras e os dois se conectam direto via WebRTC.

## Stack

- Vite, TypeScript (strict) e Tailwind CSS v4
- CodeMirror 6, com destaque de sintaxe para C, C++, C#, JavaScript, TypeScript, Python, Java e Go
- Trystero, para a conexão peer-to-peer com sinalização via Nostr
- Vitest com jsdom, para os testes

## Comandos

Requer [Bun](https://bun.sh).

```bash
bun install
```

| Comando | O que faz |
|---------|-----------|
| `bun run dev` | Sobe o servidor de desenvolvimento em `http://localhost:5173` |
| `bun run build` | Verifica os tipos e gera o build de produção em `dist/` |
| `bun run package` | Compacta o `dist/` em `code-whispers-<versão>.zip`, pronto para o itch.io |
| `bun run test` | Roda os testes |

Para testar uma partida localmente, abra `http://localhost:5173` em uma janela normal e em uma janela anônima.

## Publicação

O passo a passo para publicar no itch.io, com as configurações do projeto, está em [PUBLISHING.md](PUBLISHING.md).
