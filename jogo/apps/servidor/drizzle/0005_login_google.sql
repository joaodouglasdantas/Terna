ALTER TABLE "jogadores" ADD COLUMN "google_id" text;--> statement-breakpoint
ALTER TABLE "jogadores" ADD CONSTRAINT "jogadores_googleId_unique" UNIQUE("google_id");