import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readSupabaseConfig, assertSupabaseBuildConfig } from './supabase-env.mjs'

const publicKey = 'sb_publishable_test-public-key'
const validEnv = {
  VITE_SUPABASE_URL: 'https://warehouse.supabase.co',
  VITE_SUPABASE_ANON_KEY: publicKey,
}

function jwt(payload) {
  return [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'test-signature',
  ].join('.')
}

test('missing and whitespace-only variables are identified by name', () => {
  for (const env of [{}, { VITE_SUPABASE_URL: ' \n ', VITE_SUPABASE_ANON_KEY: '\t' }]) {
    const config = readSupabaseConfig(env)
    assert.equal(config.isConfigured, false)
    assert.equal(config.errors.length, 2)
    assert.match(config.errors[0], /VITE_SUPABASE_URL/)
    assert.match(config.errors[1], /VITE_SUPABASE_ANON_KEY/)
  }
})

test('trims configuration and accepts publishable and legacy anon keys', () => {
  for (const key of [publicKey, jwt({ role: 'anon', iss: 'supabase' })]) {
    const config = readSupabaseConfig({
      VITE_SUPABASE_URL: `  ${validEnv.VITE_SUPABASE_URL}\n`,
      VITE_SUPABASE_ANON_KEY: `\t${key} `,
    })
    assert.equal(config.isConfigured, true)
    assert.equal(config.url, validEnv.VITE_SUPABASE_URL)
    assert.equal(config.anonKey, key)
    assert.deepEqual(config.errors, [])
  }
})

test('custom domains and local Supabase URLs are valid', () => {
  for (const url of ['https://data.example.org', 'http://localhost:54321', 'http://127.0.0.1:54321', 'http://[::1]:54321']) {
    assert.equal(readSupabaseConfig({ ...validEnv, VITE_SUPABASE_URL: url }).isConfigured, true)
  }
})

test('rejects malformed, relative, non-http, and credential-bearing URLs without echoing values', () => {
  for (const url of ['invalid-private-value', '/supabase', 'https:warehouse.supabase.co', 'ftp://warehouse.supabase.co', 'https://private-user:private-password@warehouse.supabase.co']) {
    const config = readSupabaseConfig({ ...validEnv, VITE_SUPABASE_URL: url })
    assert.equal(config.isConfigured, false)
    assert.equal(config.errors.length, 1)
    assert.match(config.errors[0], /VITE_SUPABASE_URL/)
    assert.equal(config.errors.join('\n').includes(url), false)
    assert.doesNotMatch(config.errors.join('\n'), /private-user|private-password/)
  }
})

test('rejects checked-in .env.example placeholders', () => {
  const env = {}
  for (const line of readFileSync(new URL('../.env.example', import.meta.url), 'utf8').split(/\r?\n/)) {
    const assignment = /^\s*(VITE_SUPABASE_\w+)\s*=\s*(.*)$/.exec(line)
    if (assignment) env[assignment[1]] = assignment[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  const config = readSupabaseConfig(env)
  assert.equal(config.isConfigured, false)
  assert.equal(config.errors.some(error => error.includes('VITE_SUPABASE_ANON_KEY')), true)
})

test('rejects URL and key placeholder spellings', () => {
  for (const url of ['https://xxxxxxxxxxxx.supabase.co', 'https://your-project.supabase.co']) {
    assert.equal(readSupabaseConfig({ ...validEnv, VITE_SUPABASE_URL: url }).isConfigured, false)
  }
  for (const key of ['your-anon-key', '<publishable-key>', 'public-anon-key', 'replace_me']) {
    assert.equal(readSupabaseConfig({ ...validEnv, VITE_SUPABASE_ANON_KEY: key }).isConfigured, false)
  }
})

test('rejects secret and legacy service_role keys without exposing them', () => {
  for (const key of ['sb_secret_private-test-value', jwt({ role: 'service_role', note: 'private-payload' })]) {
    const config = readSupabaseConfig({ ...validEnv, VITE_SUPABASE_ANON_KEY: key })
    assert.equal(config.isConfigured, false)
    assert.equal(config.errors.length, 1)
    assert.match(config.errors[0], /secret.*service_role/)
    assert.equal(config.errors.join('\n').includes(key), false)
    assert.doesNotMatch(config.errors.join('\n'), /private-test-value|private-payload/)
  }
})

test('malformed JWT-like input cannot crash validation', () => {
  assert.doesNotThrow(() => readSupabaseConfig({ ...validEnv, VITE_SUPABASE_ANON_KEY: 'header.%%%%.signature' }))
})

test('normal builds require configuration for every mode', () => {
  for (const mode of [undefined, 'production', 'development', 'staging']) {
    assert.throws(() => assertSupabaseBuildConfig({}, { mode }), /VITE_SUPABASE_URL/)
    assert.throws(() => assertSupabaseBuildConfig({ ...validEnv, VITE_SUPABASE_ANON_KEY: 'sb_secret_private-test-value' }, { mode }), /service_role/)
    assert.equal(assertSupabaseBuildConfig(validEnv, { mode }).isConfigured, true)
  }
})

test('only explicit local demo builds may omit configuration', () => {
  assert.equal(assertSupabaseBuildConfig({}, { mode: 'demo' }).isConfigured, false)
  assert.equal(assertSupabaseBuildConfig({}, { mode: 'demo', vercel: false }).isConfigured, false)
  assert.equal(assertSupabaseBuildConfig({}, { mode: 'demo', vercel: '0' }).isConfigured, false)
  for (const vercel of [true, 1, '1', 'true']) {
    for (const env of [{}, validEnv]) {
      assert.throws(() => assertSupabaseBuildConfig(env, { mode: 'demo', vercel }), /demo.*Vercel/)
    }
  }
})

test('production builds on Vercel accept configured public credentials', () => {
  assert.equal(assertSupabaseBuildConfig(validEnv, { mode: 'production', vercel: '1' }).isConfigured, true)
  assert.throws(() => assertSupabaseBuildConfig({}, { mode: 'production', vercel: '1' }), /VITE_SUPABASE_URL/)
})
