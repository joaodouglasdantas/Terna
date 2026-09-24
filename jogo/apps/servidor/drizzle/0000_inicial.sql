CREATE TABLE "jogadores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"nome_normalizado" text NOT NULL,
	"email" text,
	"senha_hash" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jogadores_nomeNormalizado_unique" UNIQUE("nome_normalizado"),
	CONSTRAINT "jogadores_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "recordes" (
	"jogador_id" uuid NOT NULL,
	"categoria" text NOT NULL,
	"valor" integer NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recordes_jogador_id_categoria_pk" PRIMARY KEY("jogador_id","categoria")
);
--> statement-breakpoint
CREATE TABLE "saves" (
	"jogador_id" uuid NOT NULL,
	"slot" integer NOT NULL,
	"versao" integer NOT NULL,
	"dados" jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saves_jogador_id_slot_pk" PRIMARY KEY("jogador_id","slot")
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jogador_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	CONSTRAINT "sessoes_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "recordes" ADD CONSTRAINT "recordes_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saves" ADD CONSTRAINT "saves_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recordes_categoria_valor_idx" ON "recordes" USING btree ("categoria","valor");--> statement-breakpoint
CREATE INDEX "sessoes_jogador_idx" ON "sessoes" USING btree ("jogador_id");