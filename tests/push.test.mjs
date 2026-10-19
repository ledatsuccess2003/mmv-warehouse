import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto'
import vm from 'node:vm'

// Isolate HTTP/RPC semantics from live transport and credentials. Only the ESM import/export
// declarations are replaced; the tested handler body is the actual deployment source.
const source = readFileSync(new URL('../api/push.js', import.meta.url), 'utf8')
  .replace(/^import .+ from ['"][^'"]+['"];?[ \t]*\r?\n/gm, '')
  .replace('export default async function handler', 'async function handler')
const opaqueToken = 'a'.repeat(64)
const testEnv = { SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key', VAPID_PUBLIC_KEY: 'synthetic-public',
  VAPID_PRIVATE_KEY: 'synthetic-private', SUPABASE_URL: 'https://synthetic.supabase.co' }
const subscription = { id: 'device-uuid', endpoint: 'https://fcm.googleapis.com/synthetic',
  keys: { p256dh: 'synthetic-p256dh', auth: 'synthetic-auth' } }
const outbox = { id: 12, lease_token: 'lease-uuid', notification: { id: 99, request_id: 'request-uuid',
  title: 'Private job information', body: 'Private material description' }, subscriptions: [subscription] }

function harness({ env = testEnv, rows = [outbox], sendError, rejectSession = false, rpcError } = {}) {
  const rpcCalls = [], pushCalls = [], secretComparisons = []
  const timingSafeEqual = (actual, expected) => {
    secretComparisons.push({ actual: Buffer.from(actual), expected: Buffer.from(expected) })
    return cryptoTimingSafeEqual(actual, expected)
  }
  const webpush = {
    setVapidDetails() {},
    async sendNotification(sub, payload, options) { pushCalls.push({ sub, payload: JSON.parse(payload), options }); if (sendError) throw sendError },
  }
  async function fetch(url, options) {
    const name = new URL(url).pathname.split('/').at(-1)
    const args = JSON.parse(options.body)
    rpcCalls.push({ name, args, headers: options.headers })
    if (rpcError?.name === name) return { ok:false, status:rpcError.status || 403, async json() { return {code:rpcError.code,message:'Never expose provider response or secrets'} } }
    const data = name === 'mmv_claim_push_outbox' ? rows : name === 'mmv_session' ? { user: { id: 1 } } : { ok: true }
    return { ok: !(name === 'mmv_session' && rejectSession), status:400, async json() { return name === 'mmv_session' && rejectSession ? {code:'28000'} : data } }
  }
  const handler = vm.runInNewContext(`${source}\nhandler`, { webpush, timingSafeEqual, Buffer, process: { env }, fetch, URL })
  const response = { headers: {}, code: 200, body: undefined,
    setHeader(name, value) { this.headers[name] = value }, status(code) { this.code = code; return this },
    json(value) { this.body = JSON.parse(JSON.stringify(value)); return this }, end() { return this } }
  async function run(overrides = {}) {
    await handler({ method: 'POST', url: '/api/push', headers: { host: 'mmv-warehouse.vercel.app', authorization: `Bearer ${opaqueToken}` }, ...overrides }, response)
    return response
  }
  return { run, response, rpcCalls, pushCalls, secretComparisons }
}

test('GET returns only public VAPID configuration, never private database/push secrets', async () => {
  const h = harness()
  const r = await h.run({ method: 'GET' })
  assert.equal(r.code, 200)
  assert.deepEqual(r.body, { enabled: true, publicKey: 'synthetic-public' })
  assert.equal(r.headers['Cache-Control'], 'no-store')
  assert.equal(h.rpcCalls.length, 0)
  assert.equal(JSON.stringify(r.body).includes('synthetic-private'), false)
  assert.equal(JSON.stringify(r.body).includes('synthetic-service-key'), false)
})

test('disabled transport retains inbox, unsupported methods and missing bearer are rejected', async () => {
  assert.equal((await harness({ env: {} }).run()).code, 503)
  const unknown = await harness().run({ method: 'DELETE' })
  assert.equal(unknown.code, 405)
  assert.equal(unknown.headers.Allow, 'GET, POST')
  const h = harness()
  assert.equal((await h.run({ headers: { host: 'mmv-warehouse.vercel.app' } })).code, 401)
  assert.equal(h.rpcCalls.length, 0)
})

test('malformed and mismatched Origins are forbidden before any privileged RPC', async () => {
  for (const origin of ['not-a-url', 'https://evil.example', 'https://mmv-warehouse.vercel.app.evil.example']) {
    const h = harness()
    const response = await h.run({ headers: { host: 'mmv-warehouse.vercel.app', origin, authorization: `Bearer ${opaqueToken}` } })
    assert.equal(response.code, 403)
    assert.equal(h.rpcCalls.length, 0)
  }
})

test('expired/invalid session cannot claim the durable push outbox', async () => {
  const h = harness({ rejectSession: true })
  assert.equal((await h.run()).code, 401)
  assert.deepEqual(h.rpcCalls.map(call => call.name), ['mmv_session'])
})

test('a server database/key failure is not mislabeled as the employee password being wrong', async () => {
  const h = harness({rpcError:{name:'mmv_session',code:'42501'}})
  const r = await h.run()
  assert.equal(r.code,503)
  assert.equal(r.body.stage,'session_validation')
  assert.equal(h.rpcCalls.length,1)
  assert.equal(h.pushCalls.length,0)
  assert.equal(JSON.stringify(r.body).includes('synthetic-service-key'),false)
})

test('outbox permission/configuration failure is distinguished from an unregistered phone', async () => {
  const h = harness({rpcError:{name:'mmv_claim_push_outbox',code:'42501'}})
  const r = await h.run()
  assert.equal(r.code,502)
  assert.equal(r.body.stage,'outbox_claim')
  assert.equal(h.pushCalls.length,0)
  assert.equal(JSON.stringify(r.body).includes('Never expose'),false)
})

test('verified request claims a bounded batch and acknowledges exactly the lease after successful send', async () => {
  const h = harness()
  const r = await h.run()
  assert.deepEqual(r.body, { delivered: 1 })
  assert.equal(h.rpcCalls[0].name, 'mmv_session')
  assert.equal(h.rpcCalls[0].args.p_token, opaqueToken)
  assert.equal(h.rpcCalls[1].name, 'mmv_claim_push_outbox')
  assert.equal(h.rpcCalls[1].args.p_limit <= 5, true)
  assert.deepEqual(h.rpcCalls.at(-1).args, { p_id: 12, p_lease_token: 'lease-uuid', p_delivered: true, p_error: null })
  assert.equal(h.pushCalls.length, 1)
  assert.equal(h.pushCalls[0].payload.id, 99)
  assert.equal(h.pushCalls[0].payload.request_id, 'request-uuid')
  assert.equal(h.pushCalls[0].payload.body.includes('Private material'), false)
  assert.equal(h.pushCalls[0].options.timeout <= 7000, true)
  assert.equal(h.rpcCalls.every(call => call.headers.apikey === 'synthetic-service-key' && call.headers.Authorization === undefined), true)
})

test('cron GET dispatch rejects missing or unconfigured secrets without database access', async () => {
  const secret = 'synthetic-cron-secret'
  for (const [env, authorization] of [[testEnv, `Bearer ${secret}`],
    [{ ...testEnv, CRON_SECRET: secret }, undefined]]) {
    const h = harness({ env })
    const response = await h.run({ method: 'GET', url: '/api/push?dispatch=1',
      headers: { host: 'mmv-warehouse.vercel.app', authorization } })
    assert.equal(response.code, 401)
    assert.equal(h.rpcCalls.length, 0)
    assert.equal(h.secretComparisons.length, 0)
  }
})

test('cron rejects equal-length wrong secrets using actual timingSafeEqual, not direct string equality', async () => {
  const secret = 'synthetic-cron-secret'
  const h = harness({ env: { ...testEnv, CRON_SECRET: secret } })
  const response = await h.run({ method: 'GET', url: '/api/push?dispatch=1',
    headers: { host: 'mmv-warehouse.vercel.app', authorization: `Bearer ${secret.slice(0, -1)}x` } })
  assert.equal(response.code, 401)
  assert.equal(h.rpcCalls.length, 0)
  assert.equal(h.secretComparisons.length, 1)
  assert.equal(h.secretComparisons[0].actual.byteLength, h.secretComparisons[0].expected.byteLength)
  assert.notDeepEqual(h.secretComparisons[0].actual, h.secretComparisons[0].expected)
})

test('cron safely rejects different UTF-8 byte lengths before the constant-time primitive', async () => {
  const secret = 'synthetic-cron-secret'
  const h = harness({ env: { ...testEnv, CRON_SECRET: secret } })
  const response = await h.run({ method: 'GET', url: '/api/push?dispatch=1',
    headers: { host: 'mmv-warehouse.vercel.app', authorization: `Bearer ${secret}é` } })
  assert.equal(response.code, 401)
  assert.equal(h.rpcCalls.length, 0)
  assert.equal(h.secretComparisons.length, 0)
})

test('authorized cron claims only five leased notifications, without impersonating a browser session', async () => {
  const secret = 'synthetic-cron-secret'
  const h = harness({ env: { ...testEnv, CRON_SECRET: secret } })
  const response = await h.run({ method: 'GET', url: '/api/push?dispatch=1',
    headers: { host: 'mmv-warehouse.vercel.app', authorization: `Bearer ${secret}` } })
  assert.equal(response.code, 200)
  assert.deepEqual(response.body, { delivered: 1 })
  assert.equal(h.secretComparisons.length, 1)
  assert.deepEqual(h.secretComparisons[0].actual, h.secretComparisons[0].expected)
  assert.equal(h.rpcCalls.some(call => call.name === 'mmv_session'), false)
  assert.equal(h.rpcCalls[0].name, 'mmv_claim_push_outbox')
  assert.deepEqual(h.rpcCalls[0].args, { p_limit: 5 })
  assert.equal(h.rpcCalls.at(-1).args.p_lease_token, 'lease-uuid')
  assert.equal(h.rpcCalls.at(-1).args.p_delivered, true)
})

test('SSRF endpoint variants are never sent, and their outbox entry remains undelivered', async () => {
  for (const endpoint of ['http://fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.example/x',
    'https://fcm.googleapis.com@evil.example/x', 'https://127.0.0.1/x', 'https://fcm.googleapis.com:443/x']) {
    const h = harness({ rows: [{ ...outbox, subscriptions: [{ ...subscription, endpoint }] }] })
    assert.deepEqual((await h.run()).body, { delivered: 0 })
    assert.equal(h.pushCalls.length, 0)
    assert.equal(h.rpcCalls.at(-1).args.p_delivered, false)
  }
})

test('no registered device is not reported as successful notification delivery', async () => {
  const h = harness({ rows: [{ ...outbox, subscriptions: [] }] })
  assert.deepEqual((await h.run()).body, { delivered: 0 })
  assert.equal(h.rpcCalls.at(-1).args.p_delivered, false)
})

test('a real provider 404/410 removes the expired device but does not falsely mark all-expired sends delivered', async () => {
  for (const statusCode of [404, 410]) {
    const h = harness({ sendError: { statusCode } })
    assert.deepEqual((await h.run()).body, { delivered: 0 })
    const remove = h.rpcCalls.find(call => call.name === 'mmv_push_remove_expired')
    assert.equal(remove.args.p_subscription_id, subscription.id)
    assert.equal(h.rpcCalls.at(-1).args.p_delivered, false)
  }
})

test('temporary provider failures leave the device and durable outbox for a retry', async () => {
  const h = harness({ sendError: { statusCode: 503 } })
  assert.deepEqual((await h.run()).body, { delivered: 0 })
  assert.equal(h.rpcCalls.some(call => call.name === 'mmv_push_remove_expired'), false)
  assert.equal(h.rpcCalls.at(-1).args.p_delivered, false)
})
