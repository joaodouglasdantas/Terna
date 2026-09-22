# .codex/rules/ — allowlist de comandos do Codex (execpolicy)

Equivalente **Codex** da allowlist estreita que o harness mantém no
`.claude/settings.json` para o Claude Code — os dois derivam da **mesma** tabela do
Perfil ("Execução autônoma — comandos conhecidos-seguros"). Nunca copie
`permissions.allow` literalmente: os formatos e as semânticas são diferentes.

- Formato: arquivos `*.rules` em **Starlark** com `prefix_rule()` (recurso
  **experimental** do Codex — confirme na doc atual antes de depender dele).
- Gerar a partir do Perfil (para revisar e salvar aqui como `harness.rules`):

  ```bash
  bash .claude/harness-doctor.sh --gen-rules
  ```

- `decision = "allow"` roda sem prompt; `"prompt"` pede aprovação; `"forbidden"`
  bloqueia. Rule mais restritiva vence. Só entram comandos **estreitos** (comando +
  subcomando fixos) — mesma filosofia 1.9.0 do lado Claude.
- Estes arquivos só carregam com o projeto **trusted**; `codex exec --ignore-rules`
  os ignora.

> Este README viaja no sync (documentação). Os `*.rules` em si são decisão local do
> projeto — o sync nunca os cria nem sobrescreve.
