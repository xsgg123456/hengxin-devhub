CREATE TABLE IF NOT EXISTS "notification_logs" (
  "id" TEXT PRIMARY KEY,
  "outbox_id" TEXT NOT NULL UNIQUE REFERENCES "notification_outbox"("id") ON DELETE CASCADE,
  "state" TEXT NOT NULL,
  "task_id" TEXT,
  "safe_error" TEXT,
  "sent_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL
);
