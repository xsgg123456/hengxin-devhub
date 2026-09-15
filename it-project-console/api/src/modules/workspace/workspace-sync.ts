import { createHash } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { sessionCookie } from '../../plugins/auth.js'

export async function workspaceRevision(db: PrismaClient): Promise<string> {
  const rows = await db.$queryRaw<Array<{ revision: string }>>`SELECT revision::text FROM workspace_revision WHERE id = 1`
  if (!rows[0]) throw new Error('Workspace revision is not initialized')
  return rows[0].revision
}

type Connection = { response: ServerResponse; tokenHash: string; revision: string; lastWrite: number; cleanup: () => void }
type SyncSource = {
  revision: () => Promise<string>
  validSessions: (hashes: string[]) => Promise<Set<string>>
}

/** One poll per API instance, independent of connection count and workspace size. */
export class WorkspaceSync {
  private connections = new Set<Connection>()
  private timer?: ReturnType<typeof setInterval>
  private polling = false
  private stopped = false
  constructor(private source: SyncSource, private intervalMs = 1000) {}

  connect(response: ServerResponse, tokenHash: string, revision: string) {
    if (this.stopped || response.destroyed) { response.end(); return }
    const connection: Connection = { response, tokenHash, revision, lastWrite: Date.now(), cleanup: () => {} }
    connection.cleanup = () => {
      this.connections.delete(connection)
      response.off('close', connection.cleanup)
      response.off('error', connection.cleanup)
      if (!this.connections.size && this.timer) { clearInterval(this.timer); this.timer = undefined }
    }
    this.connections.add(connection)
    response.once('close', connection.cleanup)
    response.once('error', connection.cleanup)
    this.write(connection, `retry: 2000\nevent: change\ndata: ${JSON.stringify({ revision })}\n\n`)
    if (this.connections.size && !this.timer) {
      this.timer = setInterval(() => { void this.poll() }, this.intervalMs)
      this.timer.unref()
    }
  }

  private write(connection: Connection, data: string) {
    if (connection.response.destroyed || connection.response.writableEnded) { connection.cleanup(); return }
    try {
      // A slow consumer reconnects and receives the latest revision; never queue
      // an unbounded event backlog, since intermediate revisions are expendable.
      if (!connection.response.write(data)) { connection.cleanup(); connection.response.destroy() }
      connection.lastWrite = Date.now()
    } catch { connection.cleanup(); connection.response.destroy() }
  }

  async poll() {
    if (this.polling || this.stopped || !this.connections.size) return
    this.polling = true
    const snapshot = [...this.connections]
    try {
      const [revision, valid] = await Promise.all([
        this.source.revision(),
        this.source.validSessions([...new Set(snapshot.map(connection => connection.tokenHash))])
      ])
      for (const connection of snapshot) {
        if (!this.connections.has(connection)) continue
        if (!valid.has(connection.tokenHash)) {
          this.write(connection, 'event: session-expired\ndata: {}\n\n')
          connection.cleanup()
          connection.response.end()
        } else if (revision !== connection.revision) {
          connection.revision = revision
          this.write(connection, `event: change\ndata: ${JSON.stringify({ revision })}\n\n`)
        } else if (Date.now() - connection.lastWrite >= 15000) this.write(connection, ': heartbeat\n\n')
      }
    } catch {
      // Database outages must not leave authenticated-looking streams alive.
      // Closing prompts EventSource to reconnect through normal authentication.
      for (const connection of snapshot) { connection.cleanup(); connection.response.end() }
    } finally { this.polling = false }
  }

  close() {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    for (const connection of this.connections) { connection.cleanup(); connection.response.end() }
  }
}

export function registerWorkspaceSync(app: FastifyInstance, db: PrismaClient, authenticate: (request: FastifyRequest) => Promise<void>) {
  const sync = new WorkspaceSync({
    revision: () => workspaceRevision(db),
    validSessions: async hashes => {
      const sessions = await db.session.findMany({
        where: { tokenHash: { in: hashes }, expiresAt: { gt: new Date() }, user: { active: true } },
        select: { tokenHash: true }
      })
      return new Set(sessions.map(session => session.tokenHash))
    }
  })
  // preClose runs before connection draining: onClose alone would hang on SSE.
  app.addHook('preClose', async () => { sync.close() })
  app.get('/api/workspace/revision', { preHandler: authenticate }, async (_request, reply) => {
    reply.header('Cache-Control', 'no-store')
    return { data: { revision: await workspaceRevision(db) } }
  })
  app.get('/api/workspace/events', { preHandler: authenticate }, async (request, reply) => {
    const revision = await workspaceRevision(db)
    // Recheck after the read and before switching to a streaming response.
    await authenticate(request)
    reply.hijack()
    for (const [name, value] of Object.entries(reply.getHeaders())) {
      if (value !== undefined) reply.raw.setHeader(name, value)
    }
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive'
    })
    reply.raw.flushHeaders()
    sync.connect(reply.raw, createHash('sha256').update(request.cookies[sessionCookie]!).digest('hex'), revision)
  })
}
