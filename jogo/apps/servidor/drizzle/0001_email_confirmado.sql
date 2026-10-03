CREATE TABLE "codigos_email" (
	"jogador_id" uuid NOT NULL,
	"motivo" text NOT NULL,
	"codigo_hash" text NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	CONSTRAINT "codigos_email_jogador_id_motivo_pk" PRIMARY KEY("jogador_id","motivo")
);
--> statement-breakpoint
ALTER TABLE "jogadores" ADD COLUMN "email_confirmado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "codigos_email" ADD CONSTRAINT "codigos_email_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- As contas de antes da confirmação por e-mail continuam entrando: valem como confirmadas.
UPDATE "jogadores" SET "email_confirmado_em" = "criado_em" WHERE "email_confirmado_em" IS NULL;