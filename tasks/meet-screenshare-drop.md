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
