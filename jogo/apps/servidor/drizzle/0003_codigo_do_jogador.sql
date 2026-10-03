ALTER TABLE "jogadores" ADD COLUMN "codigo" text;--> statement-breakpoint
-- As contas que já existiam ganham um código tirado do id (o das novas é sorteado pelo servidor).
UPDATE "jogadores" SET "codigo" = upper(substr(md5("id"::text), 1, 4) || '-' || substr(md5("id"::text), 5, 4)) WHERE "codigo" IS NULL;--> statement-breakpoint
ALTER TABLE "jogadores" ALTER COLUMN "codigo" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "jogadores" ADD CONSTRAINT "jogadores_codigo_unique" UNIQUE("codigo");
