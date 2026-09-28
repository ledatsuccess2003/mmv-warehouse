const URL_NAME = 'VITE_SUPABASE_URL'
const KEY_NAME = 'VITE_SUPABASE_ANON_KEY'

function valueFrom(env, name) {
  return typeof env?.[name] === 'string' ? env[name].trim() : ''
}

function isPlaceholder(value) {
  return /your[-_ ](?:supabase|project|anon|publishable|key)|replace[-_ ]?me|change[-_ ]?me|placeholder|<[^>]+>/i.test(value)
    || /^(?:public-anon-key|anon-key|your-key)$/i.test(value)
}

function jwtRole(key) {
  const parts = key.split('.')
  if (parts.length !== 3) return undefined
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')
    return JSON.parse(atob(padded))?.role
  } catch {
    return undefined
  }
}

/** Validate public browser configuration without including credentials in errors. */
export function readSupabaseConfig(env) {
  const url = valueFrom(env, URL_NAME)
  const anonKey = valueFrom(env, KEY_NAME)
  const errors = []

  if (!url) {
    errors.push(`Thiếu ${URL_NAME}.`)
  } else {
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      // Report only the variable name, never its value.
    }
    if (!parsed || !/^https?:\/\//i.test(url)
      || !['http:', 'https:'].includes(parsed.protocol)
      || !parsed.hostname || parsed.username || parsed.password) {
      errors.push(`${URL_NAME} phải là URL http/https đầy đủ, không chứa tên đăng nhập hoặc mật khẩu.`)
    } else if (isPlaceholder(url) || /^x{3,}$/i.test(parsed.hostname.split('.')[0])) {
      errors.push(`${URL_NAME} vẫn là giá trị mẫu; hãy dùng URL dự án Supabase.`)
    }
  }

  if (!anonKey) {
    errors.push(`Thiếu ${KEY_NAME}.`)
  } else if (/^sb_secret_/i.test(anonKey) || jwtRole(anonKey) === 'service_role') {
    errors.push(`${KEY_NAME} không được dùng khóa secret hoặc service_role; hãy dùng khóa anon/publishable công khai.`)
  } else if (isPlaceholder(anonKey)) {
    errors.push(`${KEY_NAME} vẫn là giá trị mẫu; hãy dùng khóa anon/publishable của dự án Supabase.`)
  } else if (/\s/.test(anonKey) || anonKey === 'sb_publishable_') {
    errors.push(`${KEY_NAME} không hợp lệ; hãy dùng khóa anon/publishable công khai.`)
  }

  return { url, anonKey, errors, isConfigured: errors.length === 0 }
}

/** Every build requires valid configuration; there is no demo/mock mode. */
export function assertSupabaseBuildConfig(env) {
  const config = readSupabaseConfig(env)
  if (!config.isConfigured) {
    throw new Error(`[MMV] Không thể build khi cấu hình Supabase chưa hợp lệ:\n${config.errors.join('\n')}\nCấu hình hai biến môi trường rồi build lại.`)
  }
  return config
}
