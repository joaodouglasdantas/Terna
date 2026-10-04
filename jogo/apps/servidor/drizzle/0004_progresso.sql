CREATE TABLE "partidas_da_conta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jogador_id" uuid NOT NULL,
	"modo" text NOT NULL,
	"comecou_em" timestamp with time zone DEFAULT now() NOT NULL,
	"terminou_em" timestamp with time zone,
	"resultado" text,
	"xp" integer DEFAULT 0 NOT NULL,
	"pontos" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jogadores" ADD COLUMN "xp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "jogadores" ADD COLUMN "azios" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "jogadores" ADD COLUMN "passe_temporada" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "jogadores" ADD COLUMN "passe_pontos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "jogadores" ADD COLUMN "passe_resgatados" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "partidas_da_conta" ADD CONSTRAINT "partidas_da_conta_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partidas_da_conta_jogador_idx" ON "partidas_da_conta" USING btree ("jogador_id","comecou_em");