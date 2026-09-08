import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const composeEnv = new URL(".env", root);
const apiEnv = new URL("api/.env", root);
if (existsSync(composeEnv) || existsSync(apiEnv)) {
  console.log(
    "本地配置已存在，请保留现有凭据；缺失配置可参照 .env.example 补齐。",
  );
  process.exit(0);
}
const password = randomBytes(24).toString("hex");
const access = "itpc_" + randomBytes(8).toString("hex");
const secret = randomBytes(32).toString("hex");
writeFileSync(
  composeEnv,
  `POSTGRES_PASSWORD=${password}\nS3_ACCESS_KEY=${access}\nS3_SECRET_KEY=${secret}\n`,
  { flag: "wx", mode: 0o600 },
);
writeFileSync(
  apiEnv,
  [
    "NODE_ENV=development",
    "DEV_LOGIN=true",
    "PORT=4322",
    "WEB_ORIGIN=http://127.0.0.1:4317",
    `DATABASE_URL=postgresql://it_project_console:${password}@127.0.0.1:55432/it_project_console`,
    "S3_ENDPOINT=http://127.0.0.1:59000",
    "S3_PUBLIC_ENDPOINT=http://127.0.0.1:59000",
    "S3_BUCKET=it-project-console",
    `S3_ACCESS_KEY=${access}`,
    `S3_SECRET_KEY=${secret}`,
    "",
  ].join("\n"),
  { flag: "wx", mode: 0o600 },
);
console.log(`已生成独立本地配置：${fileURLToPath(root)}（凭据不输出、不提交）`);
