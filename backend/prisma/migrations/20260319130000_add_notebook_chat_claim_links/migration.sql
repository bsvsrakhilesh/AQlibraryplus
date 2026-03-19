ALTER TABLE "public"."NotebookChatRun"
ADD COLUMN "claimLinksVersion" TEXT,
ADD COLUMN "claimLinks" JSONB;