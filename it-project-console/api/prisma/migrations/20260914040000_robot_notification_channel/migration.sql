ALTER TABLE "notification_logs" ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'work';
ALTER TABLE "notification_logs" ADD COLUMN IF NOT EXISTS "sender_code" TEXT;
ALTER TABLE "notification_logs" ADD COLUMN IF NOT EXISTS "recipient_ding_id" TEXT;
