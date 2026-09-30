# Code Whispers

O telefone sem fio do código. Um jogo multiplayer no navegador para escrever código, explicar o código dos outros e descobrir o quanto a ideia original muda no caminho.

Jogue em [joaovictorvm.itch.io/code-whispers](https://joaovictorvm.itch.io/code-whispers). Não tem cadastro nem instalação: um jogador cria a sala, compartilha o código de 6 letras e os outros entram.

## Como jogar

### Duelo (2 jogadores)

1. Cada jogador escreve ou cola um trecho de código.
2. Os códigos são trocados, e cada um explica com as próprias palavras o que o código do outro faz.
3. O autor lê a explicação sobre o próprio código e dá o veredito: **Errou**, **Meio Certo** ou **Correto**.
4. A partida tem 3, 5 ou 7 rodadas e termina com um resumo dos vereditos de cada jogador.

### Telefone sem fio (3 a 8 jogadores)

1. Os jogadores se reúnem na sala de espera, e o host começa a partida a partir de 3 pessoas.
2. Cada jogador começa uma cadeia. Com número ímpar de jogadores, a primeira etapa é escrever um código. Com número par, é inventar a descrição de um programa.
3. A cada etapa, as cadeias passam para o próximo jogador, alternando entre código e texto: quem recebe código explica o que ele faz, e quem recebe uma explicação escreve um código que faça aquilo. A última etapa é sempre código.
4. Cada jogador só vê a etapa anterior, sem saber quem escreveu.
5. No final, o host revela as cadeias etapa por etapa, para todos ao mesmo tempo, e depois leva o grupo de volta para a sala de espera.

Nos dois modos, o código nunca é executado, e cada etapa só avança quando todos marcam **Pronto**.

## Como funciona

- **Sem servidor.** O jogo é um pacote estático (HTML, CSS e JS). Os jogadores se conectam direto pelo navegador via WebRTC, usando o [Trystero](https://github.com/dmotz/trystero) com sinalização por relays Nostr públicos.
- **Duelo.** Os dois jogadores trocam mensagens de "pronto" com o conteúdo de cada fase, e a fase avança quando os dois confirmam.
- **Telefone sem fio.** O host é o árbitro: guarda as cadeias, calcula a rotação, manda para cada jogador só o que ele precisa responder e valida todas as respostas. As cadeias completas só são enviadas na revelação.

| Pasta | Conteúdo |
|-------|----------|
| `src/network` | Salas, sincronização do Duelo e motor do Telefone sem fio, com as regras puras em módulos `*Protocol.ts` |
| `src/screens` | Uma tela por etapa do jogo, trocadas pelo roteador em `src/main.ts` |
| `src/ui` | Componentes visuais reutilizáveis |
| `src/editor` | Editor CodeMirror com o tema do jogo e as linguagens suportadas |
| `src/state` | Estado global com assinatura de mudanças e o perfil do jogador |
| `src/audio` | Sons sintetizados com Web Audio |

## Stack

- Vite, TypeScript (strict) e Tailwind CSS v4
- CodeMirror 6, com destaque de sintaxe para C, C++, C#, JavaScript, TypeScript, Python, Java e Go
- Trystero, para a conexão peer-to-peer
- GSAP e canvas-confetti, para as animações
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
| `bun run typecheck` | Verifica os tipos sem gerar build |

Para testar localmente, abra `http://localhost:5173` em várias janelas anônimas, uma por jogador: duas para o Duelo e de três a oito para o Telefone sem fio.

## Publicação

O passo a passo para publicar no itch.io, com as configurações do projeto, está em [PUBLISHING.md](PUBLISHING.md).

## Licença

Code Whispers é software livre, distribuído sob a [GNU Affero General Public License 3.0](LICENSE), na versão 3 ou em qualquer versão posterior. Quem distribuir ou hospedar uma versão modificada precisa disponibilizar o código-fonte dessa versão sob a mesma licença.

Como o jogo usa o GSAP, que tem licença própria, o arquivo [LICENSE-EXCEPTION](LICENSE-EXCEPTION) concede uma permissão adicional para combinar o projeto com essa biblioteca. O mesmo arquivo lista as licenças dos componentes de terceiros incluídos no jogo.
