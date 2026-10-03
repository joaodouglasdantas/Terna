ALTER TABLE "jogadores" ADD COLUMN "icone" text DEFAULT 'flor-de-chapeu' NOT NULL;--> statement-breakpoint
ALTER TABLE "jogadores" ADD COLUMN "nome_trocado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jogadores" ADD COLUMN "modo_mestre" boolean DEFAULT true NOT NULL;