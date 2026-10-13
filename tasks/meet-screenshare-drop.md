# Meet: quem compartilha a tela cai e volta mudo

Aberta em 12/10/2026. Status: investigado, nada aplicado (o usuário pediu para não subir nada ainda).

## Sintoma

Em meet.dumont.cloud, quem compartilha a tela cai da sala e volta sozinho
em cerca de 1s. Volta sem o compartilhamento e com o microfone mudo ou sem
publicar. Se a pessoa não perceber, continua falando sem ninguém ouvir.

## Evidência (logs do LiveKit no hel1, 06/10 a 12/10, horários em UTC)

- A correção de 29/09 está no ar: o bundle do `meet-frontend:v1.33.0-3` tem
  `singlePeerConnection:!1`, `contentHint:"detail"` e `systemAudio:"exclude"`.
  O problema continua mesmo assim.
- **Causa A, infra (provada):** em 14 momentos todos os participantes da sala
  perderam o websocket de sinalização no mesmo milissegundo, e todos fizeram
  resume. Cada um desses momentos bate, no mesmo segundo, com um
  `systemctl reload caddy` no hel1. Em 12/10 foram 22:01:33, 22:03:10,
  22:14:14, 22:16:49, 22:18:05, 22:44:35, 22:53:05 e 22:54:26. Foram 436
  reloads em 7 dias: 382 vindos de `/opt/moveezi` e 46 de `/opt/shipeezi`.
  - `moveezi/deploy/caddy/lib/caddyfile-apply.sh:148` e
    `lib/caddyfile-site-apply.sh:104` recarregam o Caddy **mesmo quando o
    Caddyfile não mudou** (o ramo "No change"). Isso acontece em todo deploy.
    O Shipeezi tem uma cópia da mesma lib em `/opt/shipeezi/deploy/caddy/lib/`.
  - O bloco `livekit.getdumont.ai` em `/etc/caddy/Caddyfile:790` não tem
    `stream_close_delay`. Sem ele, o Caddy fecha os websockets na hora em que
    a config antiga é descarregada.
  - Depois do resume, quem está compartilhando fica preso ("sdp state:
    multiple offers without answer" no PUBLISHER). Cerca de 20s depois o SDK
    faz a reconexão completa: `restartConnection` → `sendLeave` →
    `CLIENT_REQUEST_LEAVE` → novo participantID. Exemplos: 22:44:36 → 22:44:56
    e 22:54:27 → 22:55:49.
- **Causa B, cliente (parcial):** 11 vezes em 7 dias houve leave+rejoin em cerca
  de 1s sem nenhum reload. Aconteceu 2 a 4s antes de um SCREEN_SHARE ser
  publicado, ou seja, no próprio clique em compartilhar. O servidor registrou
  `sendLeave:true`, `isExpectedToResume:false`, SDK JS 2.21.0, Mac. Na sessão
  nova, o screen share é o primeiro track a ser publicado.
  - No SDK 2.21.0, o único caminho que faz isso sem a sinalização cair é a
    negociação do publisher falhar com `NegotiationError`
    (`RTCEngine.negotiate`, ~1649-1662). Isso liga `fullReconnectOnNext`, e
    `restartConnection` chama `sendLeave` e faz um join novo.
  - Há dois gatilhos possíveis para o `NegotiationError`:
    - timeout de `peerConnectionTimeout`, que o Meet fixa em 60s
      (`Conference.tsx:218`);
    - `setLocalDescription` ou `setRemoteDescription` rejeitado
      (`PCTransport.ts:660-681`, "unable to set offer/answer").
  - O log INFO do servidor não mostra o AddTrack do share, então não dá para
    separar os dois. Isso fica para a reprodução com log debug (item 4).
  - Descartados: fallback v1→v0, fallback de codec/backupCodec, e reconexão
    feita pelo próprio Meet (não existe).
- **Por que volta mudo** (lido no SDK 2.21.0 e no Meet):
  - `Room.handleSignalRestarted` → `republishAllTracks`. Se alguma publicação
    falha, o erro vai só para `log.error`: não há retry e a UI não fica
    sabendo. Num caso o microfone só foi publicado 6,5 min depois do rejoin
    (23:16:44 → 23:23:20). Noutro, voltou com `muted:true`.
  - O Meet não escuta `LocalTrackUnpublished` nem `TrackMuted` do participante
    local. O `ReconnectNotice` só mostra a pílula "Reconectando". Ninguém avisa
    que o compartilhamento caiu ou que o microfone não está publicado.

## Correção proposta

1. **Infra (resolve a causa A, sem rebuild do Meet):**
   - Pôr `stream_close_delay 4h` no `reverse_proxy` de `livekit.getdumont.ai`.
     O mesmo vale para os proxies `/api/livekit` do Moveezi staging e do
     askenzo, que sofrem igual.
   - Prova: com uma sala aberta, rodar `systemctl reload caddy` e confirmar
     zero "resuming RTC session".
2. **Moveezi e Shipeezi:** no ramo "No change" de `caddyfile_apply_candidate`
   e `caddyfile_site_apply`, só rodar `caddy validate`, sem reload. Atualizar
   os testes (`caddyfile-*.test.mjs` esperam o reload hoje). Corta uns ~60
   reloads por dia.
3. **Frontend do Meet:**
   - Hook novo, montado ao lado do `ReconnectNotice`: guarda no `Reconnecting`
     se havia share publicado e o estado do microfone. No `Reconnected`, e
     também no rejoin, mostra um toast se o share caiu ("compartilhe de
     novo"). Se o microfone desejado diverge do publicado (sem publicação,
     `isMuted` ou `isUpstreamPaused`), refaz `setMicrophoneEnabled(true)` uma
     vez e mostra um toast.
   - Não republicar o share automaticamente: isso exige um gesto do usuário.
4. **Causa B:** reproduzir num Mac com Chrome (`livekit-client` log level
   debug) e descobrir por que o clique em compartilhar faz a reconexão
   completa. Hipóteses: `NegotiationError`, `PCState.NEW` no publisher, VP9
   com backupCodec. Se for o SDK, avaliar a versão nova do livekit-client.
5. **Opcional:** telemetria no `ConnectionObserver`, registrando o estado do
   microfone e do share no `Reconnected`.

## Ordem

Primeiro o item 1 (maior efeito, risco baixo, reversível). Depois o 2. Depois
o 3 e o 4 juntos, num PR no `dumont`, e o DUMONT.md na mesma mudança.

## Estado (12/10/2026)

Nada subiu. PR, merge, deploy e mudança no hel1 esperam o teste e o OK do
usuário. Antes de qualquer reload do Caddy ou deploy do Meet no hel1,
confirmar que não há sala ativa (o LiveKit atende Meet e Moveezi):

```sh
ssh airbase-hel1 'K=$(docker exec meet-backend-1 printenv LIVEKIT_API_KEY); S=$(docker exec meet-backend-1 printenv LIVEKIT_API_SECRET); docker run --rm --network host livekit/livekit-cli:latest room list --url http://127.0.0.1:7880 --api-key "$K" --api-secret "$S"'
```

Tabela vazia → pode aplicar.

| Item | Onde | Estado |
|---|---|---|
| 1 Caddy `stream_close_delay 4h` | `hel1:/tmp/Caddyfile.scd.new` (4 `reverse_proxy :7880`) | `caddy validate` EXIT=0; não aplicado. Refazer o diff contra o live na hora; depois re-sync de `dumont-ops/hel1/caddy` |
| 2a Moveezi lib sem reload no-op | `fix/caddy-skip-noop-reload` (a123d5fe4, 930883475) | `node --test deploy/caddy/*.test.mjs` EXIT=0 (55 pass); testes novos falham contra a lib antiga |
| 2b Shipeezi lib sem reload no-op | `fix/caddy-skip-noop-reload` (8c9dab9a, 7ff673f0, 8528d82d) | `node --test scripts/caddy-*.test.mjs` EXIT=0 |
| 3+5 Meet guard + telemetria | `fix/meet-reconnect-notices` | `vitest` 9/9 EXIT=0, `npm run build` EXIT=0, eslint dos arquivos tocados EXIT=0 |
| 4 Causa B | — | falta reproduzir num Mac com log debug |

Decisão: o guard nunca desmuta. O retry do mic (`setMicrophoneEnabled(true)`,
uma vez) só entra com mic sem publicação ou upstream pausado; mic publicado e
mudo recebe só o toast.

`npm run lint` / `npm run check` completos falham em arquivos fora do escopo,
já quebrados no `dumont` (`HomePanel.tsx:218` no-autofocus,
`rooms/api/listRooms.ts` prettier). Não mexidos.

Rollout, sempre com sala vazia: (1) Caddy, provado com sala de teste de 2
pessoas + `reload caddy` sem "resuming RTC session"; (2) PRs moveezi e
shipeezi para `staging`, merge commit (Moveezi: CI do GitHub no PR normal);
(3) `deploy/meet/build.sh v1.33.0-dumont-2` no hel1 e troca da tag do
frontend em `/opt/meet/compose.yaml`; (4) causa B.

Agentes (A/B Sonnet 5.5): análise inicial 1 + 1 SendMessage; Meet 1 + 1
correção por SendMessage; caddy-lib 1 sem retrabalho; revisor independente 1
(Meet, diff > 200 linhas). Nenhum refeito em Opus.

### Revisão independente (Sonnet 5.5, 12/10) e correções

Nenhum achado bloqueava. Corrigidos por mim:
- 1 e 4: toast falso quando o usuário muta ou para o share. Agora o guard
  ouve o `TrackMuted` do mic local (o SDK nunca muta sozinho) e o
  `LocalTrackUnpublished` do share durante os 3s de espera (o SDK já
  republicou antes de emitir `Reconnected`).
- 2: o retry do mic não roda se houve mute do usuário. O resto da janela
  dentro do `setMicrophoneEnabled` (o `await republishPromise`) já está
  resolvido no `Reconnected`.
- 3: a snapshot só é descartada quando a verificação termina, então uma
  segunda queda durante a espera mantém a primeira.
- 5, 9: testes de unmount, de disconnect e de cancelamento por queda dupla.
- 8: script `npm test` (`node --test 'src/**/*.test.ts'`).

Provas:
- `npm test`: 17/17, EXIT=0.
- Os testes novos rodados contra o guard antigo: 4 falham (mute na espera,
  mute no reconnecting, stop share na espera, queda dupla).
- `npm run build` EXIT=0.
- eslint em `features/rooms/livekit` EXIT=0.
- prettier nos arquivos do guard EXIT=0.

Ignorados, com motivo:
- 4, parte da fase de `Reconnecting`: parar o share com a reconexão em curso
  é ambíguo, porque o SDK também despublica nessa fase. É raro, e o custo é
  um toast a mais.
- 7: publicação sem track. Depois de um unpublish a publicação some do mapa;
  não aparece nos logs.
- 8, CI: o job `lint-front` usa o node do runner sem `setup-node` e já
  falha por lint pré-existente. Ligar `npm test` no CI fica para quando o
  lint do fork estiver verde. Os testes também ficam fora do `tsc -b`.
- 10: o texto do toast do mic agora só aparece quando o mute não foi do
  usuário, e "Check your microphone" serve.
- 11: dedupe de toast em quedas seguidas. Com a snapshot única, sai no
  máximo um toast por verificação concluída.

## Rollout (13/10/2026, liberado pelo usuário)

Sala vazia conferida antes de cada passo (`room list` vazio às 03:19Z e 03:35Z).

- **Caddy:** `stream_close_delay 4h` nos 4 `reverse_proxy :7880`, aplicado às
  03:19Z. `caddy adapt` mostra 4× 14400000000000 e os 4 sites respondem 200.
  - Prova com load-test (`lk load-test` em `wss://livekit.getdumont.ai`) e
    `reload caddy` no meio:
    - 1+1: um resume do subscriber (SDK Go) 1,6s após o reload e outro 15s
      depois, sem reload;
    - 2+2: zero resumes;
    - 1+1: zero resumes;
    - controle sem reload: zero.
  - Antes, todo reload fazia todo mundo dar resume.
  - Repo sincronizado em dumont-ops#16 (mesclado; o hash do live está no
    host).
- **Meet:** PR #7 mesclado (merge 701a0185). CI verde, menos o `lint-front`,
  que falha só em `HomePanel.tsx:218`, erro que já existia.
  - `dumont/meet-frontend:v1.33.0-4` gerado no hel1 a partir de 701a0185.
  - `compose.yaml` passou de -3 para -4. Só o frontend reiniciou.
  - O `assets/Room-*.js` servido em meet.dumont.cloud contém
    `reconnect_media_state`.
- **Moveezi #3644 e Shipeezi #303** para `staging`, rebaseados: 55/55 e 27/27.

Falta:
- teste humano (share + queda de rede de 10s);
- conferir no próximo deploy do Moveezi que não houve reload no-op;
- causa B (Mac + Chrome com log debug).
