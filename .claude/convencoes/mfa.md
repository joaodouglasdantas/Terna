---
slug: mfa
nome: "Autenticação em dois fatores (TOTP)"
categoria: seguranca
resumo: "TOTP com secret cifrado, códigos de recuperação de uso único, obrigatoriedade herdada da organização e auditoria append-only."
maturidade: estavel
aplica_se: [php]
depende_de: []
desde: 2.7.0
referencias:
  - projeto: newportaltefnet
    caminhos:
      - "portaltef/public_html/novo/db/migrations/0008_prd057_mfa_totp.sql"
      - "portaltef/public_html/novo/db/migrations/0012_prd061_sessao_tecnico_mfa_canal.sql"
      - "portaltef/public_html/novo/db/migrations/0019_auth009_mfa_setup_pendente_canal.sql"
      - "portaltef/public_html/novo/db/migrations/0026_mfa_obrigatorio_default_ativo.sql"
      - "portaltef/public_html/novo/agente/api/auth_mfa_setup_iniciar.php"
      - "portaltef/public_html/novo/agente/api/auth_mfa_setup_confirmar.php"
      - "portaltef/public_html/novo/agente/api/auth_verificar_mfa.php"
      - "portaltef/public_html/novo/seguranca/controller/mfa_ativar.php"
---

# `mfa` — autenticação em dois fatores (TOTP)

> Destilado do Portal TEF (PRD-057/AUTH#057, PRD-061, AUTH#9), onde roda em produção desde
> junho/2026 em três canais distintos. As armadilhas abaixo são incidentes reais registrados
> no `.claude/knowledge/` daquele projeto — não hipóteses.

## Por que existe

Sistema com dado de cliente e acesso multi-organização não sobrevive só com senha: credencial
vazada vira acesso pleno. TOTP resolve com custo baixo (app autenticador no celular, zero SMS,
zero custo por envio). O que não é óbvio — e é onde os projetos erram — não é gerar o código:
é **quem é obrigado**, **onde o secret mora**, **como o usuário se recupera sem o celular** e
**como isso funciona em canal sem sessão** (API, app, integração).

## Quando aplicar — e quando NÃO

- **Aplique quando:** o sistema tem login próprio e acesso a dados de terceiros (clientes,
  pacientes, financeiro), ou quando há perfis administrativos que podem alterar dados alheios.
- **Não aplique quando:** a autenticação é delegada a um IdP (Google/Azure/OAuth) que já
  impõe MFA — nesse caso o segundo fator é responsabilidade do IdP, e duplicar só irrita o
  usuário. Documente a delegação no Perfil em vez de implementar.

## Pré-requisitos no projeto

| Pré-requisito | Por quê |
|---------------|---------|
| Tabela de usuários com `id` numérico estável | Todas as tabelas abaixo referenciam `id_usuario`; UUID exige ajustar os tipos |
| Sessão de servidor **ou** um canal de token opaco | O desafio MFA precisa de estado entre "senha ok" e "código ok" |
| Chave de cifra fora do repositório (env/secret file) | O secret TOTP é cifrado; chave versionada anula a proteção |
| Relógio do servidor sincronizado (NTP) | TOTP tem janela de ±30s; drift derruba usuário legítimo |
| Runtime compatível com a lib TOTP escolhida | Ver armadilha 2 — é a falha mais silenciosa da lista |

## Modelo de dados

Quatro tabelas + uma coluna. DDL real (MySQL 5.6-compatível — ajuste tipos na sua stack):

```sql
-- 1) Config por usuário. UNIQUE em id_usuario: 1 linha por usuário, sempre.
--    ativo=0 => obrigado mas ainda não configurou (estado "pendente de setup").
CREATE TABLE IF NOT EXISTS tbl_mfa_config (
  id                  INT(11)     NOT NULL AUTO_INCREMENT,
  id_usuario          INT(11)     NOT NULL,
  ativo               TINYINT(1)  NOT NULL DEFAULT 0,
  totp_secret_cifrado TEXT        NULL,   -- base64(iv||tag||ciphertext), AES-256-GCM. NUNCA em claro.
  ativado_em          DATETIME    NULL,
  ultimo_uso_em       DATETIME    NULL,
  criado_em           DATETIME    NOT NULL,
  atualizado_em       DATETIME    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfa_usuario (id_usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Códigos de recuperação: só o HASH (SHA-256 do código normalizado — sem hífen, uppercase).
--    Uso único. O código cru só existe na tela, uma vez, no momento da geração.
CREATE TABLE IF NOT EXISTS tbl_mfa_recuperacao (
  id          INT(11)    NOT NULL AUTO_INCREMENT,
  id_usuario  INT(11)    NOT NULL,
  codigo_hash CHAR(64)   NOT NULL,
  usado       TINYINT(1) NOT NULL DEFAULT 0,
  usado_em    DATETIME   NULL,
  criado_em   DATETIME   NOT NULL,
  PRIMARY KEY (id),
  KEY idx_usuario_usado (id_usuario, usado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Auditoria append-only. Nunca UPDATE, nunca DELETE.
CREATE TABLE IF NOT EXISTS tbl_mfa_log (
  id         INT(11)      NOT NULL AUTO_INCREMENT,
  id_usuario INT(11)      NULL,
  evento     VARCHAR(40)  NOT NULL,   -- setup_iniciado | codigo_tentativa | mfa_ativado |
                                      -- validacao_sucesso | validacao_falha | recovery_usado |
                                      -- reset_admin | bloqueio_codigo
  ip         VARCHAR(45)  NULL,
  user_agent VARCHAR(255) NULL,
  detalhes   TEXT         NULL,       -- JSON montado na aplicação
  criado_em  DATETIME     NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) Desafio pendente para canais SEM sessão (API, app, integração).
--    modo='setup' guarda o secret temporário cifrado até o usuário confirmar o 1º código.
CREATE TABLE IF NOT EXISTS tbl_mfa_pendente_canal (
  id                   INT(11)      NOT NULL AUTO_INCREMENT,
  canal                VARCHAR(20)  NOT NULL,   -- 'web' | 'tecnicos' | 'agente-api' | ...
  modo                 ENUM('verify','setup') NOT NULL DEFAULT 'verify',
  setup_secret_cifrado VARCHAR(255) NULL,
  id_usuario           INT(11)      NOT NULL,
  token_hash           CHAR(64)     NOT NULL,   -- SHA-256; o token cru só vive no cliente
  tentativas           INT(11)      NOT NULL DEFAULT 0,
  criado_em            DATETIME     NOT NULL,
  expira_em            DATETIME     NOT NULL,
  consumido_em         DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfa_pendente_canal_token (token_hash),
  KEY idx_mfa_pendente_canal_usuario (id_usuario, canal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5) Obrigatoriedade individual. DEFAULT 1: usuário novo JÁ NASCE obrigado (ver armadilha 4).
ALTER TABLE tbl_Usuario ADD COLUMN mfa_obrigatorio TINYINT(1) NOT NULL DEFAULT 1;
```

**Obrigatoriedade herdada.** Além da coluna individual, uma tabela por organização
(`tbl_mfa_revenda` no Portal: `idRevenda` + `criado_em`) marca *toda* a organização —
usuários presentes **e futuros**. A função de decisão é um **OR** entre as duas fontes:

```
mfaUsuarioObrigado(id) := tbl_Usuario.mfa_obrigatorio = 1
                       OR EXISTS (tbl_mfa_<organizacao> WHERE id_org = <org do usuário>)
```

Sem distinção de tipo de usuário — a regra vale igual para admin, operador e integração.

## Contratos

**Setup em dois passos, stateless** (o mesmo par serve web e API):

| Endpoint | Entrada | Saída | Efeito |
|----------|---------|-------|--------|
| `auth_mfa_setup_iniciar` | credencial já validada | `{ token, otpauth_uri, secret_para_qr }` | grava `tbl_mfa_pendente_canal` com `modo='setup'` e o secret **cifrado** |
| `auth_mfa_setup_confirmar` | `{ token, codigo }` | `{ ok, recovery_codes[] }` | valida o código contra o secret do token, persiste em `tbl_mfa_config`, gera os códigos de recuperação (retornados **uma única vez**) |
| `auth_verificar_mfa` | `{ token, codigo }` | `{ ok }` | validação no login; aceita código TOTP **ou** código de recuperação |

**Regra de arquitetura que faz a diferença:** as funções de negócio — gerar secret, cifrar,
validar código, gerar recovery — são **puras**: recebem `($conexao, $dados)` e **nada** de
`$_SESSION`. É isso que permite o mesmo código servir web (com sessão) e API (sem sessão) sem
duplicar lógica crítica. No Portal essa decisão veio da PRD-061 e foi reaproveitada em AUTH#9.

**Estado nunca no cliente.** O secret temporário do setup fica cifrado no servidor, atrelado ao
token. Confiar no cliente devolver o secret cru abre enumeração de secrets.

**Rate-limit por canal.** Cada canal tem contador e bloqueio próprios (`tentativas` na tabela
pendente + bloqueio por IP). Canal de API não pode herdar o limite generoso da web.

## Passo a passo do port

1. **Escolher a lib TOTP** e conferir o teto de runtime do Perfil (`Compatibilidade de produção`)
   — ver armadilha 2 antes de decidir.
2. **Criar a chave de cifra** (32 bytes) fora do repositório; carregar por env. Documentar no
   Perfil como credencial local, nunca commitar.
3. **Rodar as migrations** 1–5 acima, adaptando tipos à stack. Todas idempotentes.
4. **Implementar as funções puras**: `gerarSecret`, `cifrar/decifrar`, `validarCodigo`,
   `gerarRecoveryCodes`, `mfaUsuarioObrigado`. Sem `$_SESSION`, sem `echo`, sem `header()`.
5. **Expor os 3 endpoints** da tabela de contratos, cada um chamando as funções puras.
6. **Plugar no login**: senha ok → `mfaUsuarioObrigado()` → se sim e `ativo=0`, forçar setup;
   se sim e `ativo=1`, exigir código. **Auth na primeira linha**, antes de qualquer efeito.
7. **Tela de setup** (QR + campo de 6 dígitos) e **tela de verificação** — com a trava de
   duplo-submit da armadilha 1 desde o primeiro commit.
8. **Tela de recuperação** — campo alternativo ao TOTP, com reset de visibilidade correto
   (armadilha 3).
9. **Reset administrativo**: um caminho para o suporte zerar o MFA de um usuário que perdeu o
   celular *e* os códigos. Sempre com `evento='reset_admin'` no log.
10. **Auditoria**: gravar em `tbl_mfa_log` em todos os 8 eventos. Append-only.
11. **Ativação em lote por organização**, se houver multi-tenant — no Portal isso virou uma
    skill própria (`/ativar-mfa`) com confirmação explícita, porque escreve em produção.

## Armadilhas

1. **Race condition de duplo-POST** *(Portal, 03/07/2026)* — **Sintoma:** o código correto falha
   na 1ª tentativa e passa na 2ª; nos logs, o padrão `mfa_pendente → sucesso` repetido.
   **Causa:** o campo de 6 dígitos com auto-submit concorre com o clique manual/Enter — duas
   requisições simultâneas; a primeira valida e **regenera a sessão**, a segunda chega com sessão
   já avançada e é rejeitada pelo guard. **Correção:** trava JS síncrona (`formSubmitted = true`
   no primeiro submit, bloqueando os seguintes) antes de qualquer navegação. Vale para qualquer
   form que combine auto-submit com botão. **Não dá para testar com curl** — curl não roda JS;
   exige navegador real.

2. **Lib TOTP incompatível com o runtime, falhando em silêncio** *(Portal, 03/07/2026)* —
   **Sintoma:** *toda* validação retorna inválido, independentemente do código.
   **Causa:** `RobThree/TwoFactorAuth` v2.1.0 usa `enum` (PHP 8.1+) e quebra mudo em PHP 7.4 —
   a validação retorna `null`. Agravante: o Apache local servia 7.4 apesar da config apontar
   8.2. **Correção:** fixar a versão da lib compatível com o **teto de produção** do Perfil e
   confirmar a versão real via `phpinfo()` servido por HTTP — não confiar no `httpd.conf` sem
   restart verificado.

3. **Visibilidade CSS como fonte de verdade** *(Portal, 08/07/2026)* — **Sintoma:** depois de um
   erro de código, a próxima tentativa com TOTP correto responde "Informe o código!".
   **Causa:** o handler de erro limpava o valor do campo de recuperação mas não o **escondia**;
   a lógica decide qual campo ler por `$('#box_recovery').is(':visible')`. **Correção:** todo
   path de erro restaura **valor e visibilidade**. Melhor ainda: não use estado visual como
   fonte de verdade — use uma flag explícita.

4. **DEFAULT de schema é a fonte de verdade** *(Portal, 21/07/2026)* — **Sintoma:** usuários
   novos entram sem MFA mesmo com a política ativa. **Causa:** os 3 pontos de INSERT de usuário
   não citam `mfa_obrigatorio` → herdam o DEFAULT da coluna (que era 0). **Correção:** mudar o
   DEFAULT para 1 (`ALTER COLUMN ... SET DEFAULT 1`) resolve com zero alteração de código.
   **Corolário:** ao auditar, verifique **todos** os pontos de escrita, não só o principal.
   **Bug irmão descoberto junto:** campo HTML `disabled` não vai no POST; ler `$_POST` sem
   `isset()` grava NULL em coluna NOT NULL — o MySQL 5.6 mascara inserindo 0, o 8.4 rejeita.

## Checklist de aceite

- [ ] Usuário obrigado e ainda não configurado é levado ao setup e **não consegue** pular a tela.
- [ ] O secret nunca aparece em claro no banco, em log, em resposta de API ou em URL.
- [ ] Os códigos de recuperação são exibidos **uma única vez** e só o hash é persistido.
- [ ] Um código de recuperação usado não funciona de novo.
- [ ] Código TOTP de 30s atrás e de 30s à frente são aceitos; de 5 min, rejeitados.
- [ ] Duplo-submit (auto-submit + Enter) valida **uma** vez — testado em navegador real.
- [ ] Erro de validação restaura valor **e** visibilidade de todos os campos do modal.
- [ ] Usuário criado depois da migration nasce com a obrigatoriedade correta (verificar via
      INSERT real, não só pela definição da coluna).
- [ ] Marcar a organização obriga usuários **futuros** dela, sem novo comando.
- [ ] Os 8 eventos aparecem em `tbl_mfa_log`; a tabela não sofre UPDATE nem DELETE.
- [ ] Canal sem sessão (API) completa setup e verificação sem tocar em `$_SESSION`.
- [ ] Rate-limit do canal de API é independente do da web.
- [ ] Existe caminho de reset administrativo, auditado.

## Variações por stack

- **PHP** — validada em produção (Portal TEF, MySQL 5.6, 3 canais). O DDL acima é literal.
- **Node** — ainda não portada. O desenho vale igual; troque a lib (`otplib`) e use
  `crypto.createCipheriv('aes-256-gcm')` para a cifra. **Incógnita:** o padrão de "funções
  puras + endpoints" tende a ser mais natural, mas nada foi medido.
- **Sem sessão de servidor** (SPA/app) — use só o caminho `tbl_mfa_pendente_canal`; foi
  exatamente para isso que ele nasceu (PRD-061).
