export interface SupabaseConfig {
  url: string
  anonKey: string
  errors: string[]
  isConfigured: boolean
}

export type SupabaseEnvironment = Readonly<Record<string, unknown>>

export interface SupabaseBuildOptions {
  mode?: string
  vercel?: boolean | string | number
}

export function readSupabaseConfig(env: SupabaseEnvironment): SupabaseConfig
export function assertSupabaseBuildConfig(
  env: SupabaseEnvironment,
  options?: SupabaseBuildOptions,
): SupabaseConfig
