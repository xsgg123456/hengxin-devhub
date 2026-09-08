BEGIN;
-- AlterTable
ALTER TABLE "demands" ADD COLUMN IF NOT EXISTS "department" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "expected_launch_date" DATE,
ADD COLUMN IF NOT EXISTS "prd_attachment_id" TEXT,
ADD COLUMN IF NOT EXISTS "prd_url" TEXT,
ADD COLUMN IF NOT EXISTS "prototype_attachment_id" TEXT,
ADD COLUMN IF NOT EXISTS "prototype_url" TEXT,
ADD COLUMN IF NOT EXISTS "request_id" TEXT,
ADD COLUMN IF NOT EXISTS "review_reason" TEXT,
ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMPTZ(3),
ADD COLUMN IF NOT EXISTS "reviewed_by" TEXT,
ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMPTZ(3),
ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "current_delivery_date" DATE,
ADD COLUMN IF NOT EXISTS "current_launch_date" DATE,
ADD COLUMN IF NOT EXISTS "department" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "last_overall_updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "original_delivery_date" DATE,
ADD COLUMN IF NOT EXISTS "original_launch_date" DATE,
ADD COLUMN IF NOT EXISTS "overall_progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'P1',
ADD COLUMN IF NOT EXISTS "request_id" TEXT,
ADD COLUMN IF NOT EXISTS "simple_status" TEXT NOT NULL DEFAULT 'not-started',
ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'direct',
ADD COLUMN IF NOT EXISTS "stage" TEXT NOT NULL DEFAULT '方案设计',
ADD COLUMN IF NOT EXISTS "stage_expected_date" DATE,
ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE IF NOT EXISTS "stage_histories" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "entered_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "expected_date" DATE,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stage_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "command_receipts" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "command_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "object_deletions" (
    "id" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "object_deletions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "stage_histories_project_id_stage_key" ON "stage_histories"("project_id", "stage");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "command_receipts_actor_id_key_key" ON "command_receipts"("actor_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "object_deletions_object_key_key" ON "object_deletions"("object_key");

-- AddForeignKey
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='stage_histories_project_id_fkey' AND conrelid='stage_histories'::regclass) THEN
ALTER TABLE "stage_histories" ADD CONSTRAINT "stage_histories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
END IF; END $$;

UPDATE demands d SET department = u.department FROM users u WHERE d.owner_id = u.id AND d.department = '';
UPDATE projects p SET source = 'demand', department = d.department FROM demands d WHERE p.demand_id = d.id;

COMMIT;
