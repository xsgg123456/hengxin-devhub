ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ding_union_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_ding_union_id_key" ON "users"("ding_union_id");
