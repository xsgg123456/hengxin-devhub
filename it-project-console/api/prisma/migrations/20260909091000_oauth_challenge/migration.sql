CREATE TABLE "auth_challenges" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "return_to" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "auth_challenges_expires_at_idx" ON "auth_challenges"("expires_at");
