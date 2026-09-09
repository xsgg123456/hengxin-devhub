// Executed inside the OLD application container, with stdout redirected to a 0600 file.
// Do not run interactively: stdout intentionally contains the selected configuration.
function required(value, key) {
  if (!value || /[\r\n\0]/.test(value)) throw new Error(`Missing or invalid ${key}`)
  return value
}
try {
  const source = process.env
  const oldDatabase = new URL(required(source.DATABASE_URL, 'DATABASE_URL'))
  const password = required(decodeURIComponent(oldDatabase.password), 'database password')
  const origin = new URL(required(source.NEXTAUTH_URL || source.WEB_ORIGIN, 'NEXTAUTH_URL'))
  if (origin.protocol !== 'https:' || !['', '/'].includes(origin.pathname) || origin.search || origin.hash) throw new Error('Invalid public origin')
  const database = new URL('postgresql://it_project_console@postgres:5432/it_project_console')
  database.password = encodeURIComponent(password).replaceAll("'", '%27')
  const output = {
    BIND_PORT: '18080', POSTGRES_PASSWORD: password, DATABASE_URL: database.toString(),
    NEXTAUTH_URL: origin.origin, S3_ENDPOINT: 'http://minio:9000', S3_PUBLIC_ENDPOINT: origin.origin,
    S3_BUCKET: 'it-project-console', S3_REGION: source.S3_REGION || 'us-east-1',
    S3_ACCESS_KEY: required(source.S3_ACCESS_KEY, 'S3_ACCESS_KEY'),
    S3_SECRET_KEY: required(source.S3_SECRET_KEY, 'S3_SECRET_KEY'),
    DINGTALK_APP_KEY: required(source.DINGTALK_CLIENT_ID || source.DINGTALK_APP_KEY, 'DINGTALK_APP_KEY'),
    DINGTALK_APP_SECRET: required(source.DINGTALK_CLIENT_SECRET || source.DINGTALK_APP_SECRET, 'DINGTALK_APP_SECRET'),
    DINGTALK_CORP_ID: required(source.DINGTALK_CORP_ID, 'DINGTALK_CORP_ID'),
    DINGTALK_AGENT_ID: required(source.DINGTALK_AGENT_ID, 'DINGTALK_AGENT_ID'),
    BOOTSTRAP_ADMIN_DING_USER_ID: source.BOOTSTRAP_ADMIN_DING_USER_ID || '',
    DINGTALK_NOTIFICATIONS_ENABLED: 'false', DINGTALK_MANAGER_DIGEST_TIME: '09:00',
    NODE_ENV: 'production', DEV_LOGIN: 'false'
  }
  for (const [key, value] of Object.entries(output)) {
    if (/[\r\n\0]/.test(value)) throw new Error(`Invalid ${key}`)
  }
  process.stdout.write(Object.entries(output).map(([key, value]) => `${key}='${value.replaceAll("'", "\\'")}'`).join('\n') + '\n')
} catch {
  console.error('Legacy configuration is incomplete or invalid; no new server.env was generated.')
  process.exitCode = 1
}
