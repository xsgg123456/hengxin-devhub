-- Phase 5 foundation. Generated with Prisma migrate diff, guarded for safe replay.
BEGIN;
CREATE SCHEMA IF NOT EXISTS "public";
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='role' AND n.nspname=current_schema()) THEN CREATE TYPE "role" AS ENUM ('MANAGER', 'ENGINEER', 'BUSINESS'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='demand_status' AND n.nspname=current_schema()) THEN CREATE TYPE "demand_status" AS ENUM ('DRAFT', 'PENDING', 'RETURNED', 'REJECTED', 'APPROVED', 'WITHDRAWN'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='project_status' AND n.nspname=current_schema()) THEN CREATE TYPE "project_status" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='member_type' AND n.nspname=current_schema()) THEN CREATE TYPE "member_type" AS ENUM ('COLLABORATOR'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='attachment_kind' AND n.nspname=current_schema()) THEN CREATE TYPE "attachment_kind" AS ENUM ('PRD', 'PROTOTYPE'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='attachment_status' AND n.nspname=current_schema()) THEN CREATE TYPE "attachment_status" AS ENUM ('PENDING', 'READY', 'FAILED'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='outbox_status' AND n.nspname=current_schema()) THEN CREATE TYPE "outbox_status" AS ENUM ('PENDING', 'SENT', 'FAILED'); END IF; END $$;
CREATE TABLE IF NOT EXISTS "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ding_dept_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "department_id" TEXT,
    "ding_user_id" TEXT,
    "role" "role" NOT NULL DEFAULT 'BUSINESS',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "manager_grants" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "granted_by_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "manager_grants_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "sessions" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "demands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "demand_status" NOT NULL DEFAULT 'DRAFT',
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "demands_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "project_status" NOT NULL DEFAULT 'ACTIVE',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "demand_id" TEXT,
    "primary_owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "project_members" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "member_type" NOT NULL DEFAULT 'COLLABORATOR',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "attachments" (
    "id" TEXT NOT NULL,
    "demand_id" TEXT NOT NULL,
    "uploader_id" TEXT NOT NULL,
    "kind" "attachment_kind" NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "object_key" TEXT NOT NULL,
    "staging_cleaned_at" TIMESTAMPTZ(3),
    "status" "attachment_status" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "notification_outbox" (
    "id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "demand_id" TEXT,
    "project_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "outbox_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "departments_ding_dept_id_key" ON "departments"("ding_dept_id");
CREATE UNIQUE INDEX IF NOT EXISTS "users_ding_user_id_key" ON "users"("ding_user_id");
CREATE INDEX IF NOT EXISTS "users_department_id_idx" ON "users"("department_id");
CREATE UNIQUE INDEX IF NOT EXISTS "manager_grants_user_id_key" ON "manager_grants"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_hash_key" ON "sessions"("token_hash");
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX IF NOT EXISTS "sessions_expires_at_idx" ON "sessions"("expires_at");
CREATE INDEX IF NOT EXISTS "demands_owner_id_status_idx" ON "demands"("owner_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "projects_demand_id_key" ON "projects"("demand_id");
CREATE INDEX IF NOT EXISTS "projects_primary_owner_id_idx" ON "projects"("primary_owner_id");
CREATE INDEX IF NOT EXISTS "project_members_user_id_idx" ON "project_members"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "project_members_project_id_user_id_key" ON "project_members"("project_id", "user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "attachments_object_key_key" ON "attachments"("object_key");
CREATE INDEX IF NOT EXISTS "attachments_demand_id_status_idx" ON "attachments"("demand_id", "status");
CREATE INDEX IF NOT EXISTS "attachments_status_expires_at_idx" ON "attachments"("status", "expires_at");
CREATE UNIQUE INDEX IF NOT EXISTS "notification_outbox_idempotency_key_key" ON "notification_outbox"("idempotency_key");
CREATE INDEX IF NOT EXISTS "notification_outbox_status_available_at_idx" ON "notification_outbox"("status", "available_at");
CREATE UNIQUE INDEX IF NOT EXISTS "system_settings_key_key" ON "system_settings"("key");
CREATE INDEX IF NOT EXISTS "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_department_id_fkey' AND conrelid='users'::regclass) THEN ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='manager_grants_user_id_fkey' AND conrelid='manager_grants'::regclass) THEN ALTER TABLE "manager_grants" ADD CONSTRAINT "manager_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='manager_grants_granted_by_id_fkey' AND conrelid='manager_grants'::regclass) THEN ALTER TABLE "manager_grants" ADD CONSTRAINT "manager_grants_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sessions_user_id_fkey' AND conrelid='sessions'::regclass) THEN ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='demands_owner_id_fkey' AND conrelid='demands'::regclass) THEN ALTER TABLE "demands" ADD CONSTRAINT "demands_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='projects_demand_id_fkey' AND conrelid='projects'::regclass) THEN ALTER TABLE "projects" ADD CONSTRAINT "projects_demand_id_fkey" FOREIGN KEY ("demand_id") REFERENCES "demands"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='projects_primary_owner_id_fkey' AND conrelid='projects'::regclass) THEN ALTER TABLE "projects" ADD CONSTRAINT "projects_primary_owner_id_fkey" FOREIGN KEY ("primary_owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='project_members_project_id_fkey' AND conrelid='project_members'::regclass) THEN ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='project_members_user_id_fkey' AND conrelid='project_members'::regclass) THEN ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='attachments_demand_id_fkey' AND conrelid='attachments'::regclass) THEN ALTER TABLE "attachments" ADD CONSTRAINT "attachments_demand_id_fkey" FOREIGN KEY ("demand_id") REFERENCES "demands"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='attachments_uploader_id_fkey' AND conrelid='attachments'::regclass) THEN ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_outbox_recipient_id_fkey' AND conrelid='notification_outbox'::regclass) THEN ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_outbox_demand_id_fkey' AND conrelid='notification_outbox'::regclass) THEN ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_demand_id_fkey" FOREIGN KEY ("demand_id") REFERENCES "demands"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_outbox_project_id_fkey' AND conrelid='notification_outbox'::regclass) THEN ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='audit_logs_actor_id_fkey' AND conrelid='audit_logs'::regclass) THEN ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;
COMMIT;
