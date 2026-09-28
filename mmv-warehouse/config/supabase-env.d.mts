export interface SupabaseConfig {
  url: string
  anonKey: string
  errors: string[]
  isConfigured: boolean
}

export type SupabaseEnvironment = Readonly<Record<string, unknown>>

export function readSupabaseConfig(env: SupabaseEnvironment): SupabaseConfig
export function assertSupabaseBuildConfig(env: SupabaseEnvironment): SupabaseConfig
