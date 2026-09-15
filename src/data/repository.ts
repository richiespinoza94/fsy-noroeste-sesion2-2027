import type { Repository } from '../types'
import { DemoRepository } from './demoRepository'
import { SupabaseRepository } from './supabaseRepository'
import { hasSupabaseConfig } from '../lib/supabase'

export function createRepository(): Repository {
  return hasSupabaseConfig ? new SupabaseRepository() : new DemoRepository()
}
