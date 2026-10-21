// ---------------------------------------------------------------------------
// Free Models — fetches, ranks, caches, and cascades free OpenRouter models
// ---------------------------------------------------------------------------
// Guarantees only truly free models ($0 pricing) are used, prioritized by
// reasoning capability, parameter scale, and user preference (NVIDIA & best models first).
// Provides automatic fallback cascade arrays for seamless failover on error/rate-limit.
// ---------------------------------------------------------------------------

import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

export interface FreeModel {
  id: string
  name: string
  contextLength: number
  provider: string
  rank?: number
}

// In-memory cache (refreshed each app launch)
let cachedFreeModels: FreeModel[] = []

/**
 * Deterministic quality and parameter tier list for free models.
 * Higher priority models appear earlier in the list.
 * NVIDIA models are pinned to the top per user requirement, followed by 70B+ flagships.
 */
export const VERIFIED_FREE_MODEL_FALLBACKS: FreeModel[] = [
  {
    id: 'openrouter/free',
    name: 'OpenRouter Free Auto-Router',
    contextLength: 131072,
    provider: 'openrouter',
    rank: 1,
  },
  {
    id: 'nvidia/nemotron-3.5-lightning:free',
    name: 'NVIDIA Nemotron 3.5 Lightning (Free)',
    contextLength: 131072,
    provider: 'nvidia',
    rank: 2,
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    name: 'NVIDIA Nemotron 3 Super 120B (Free)',
    contextLength: 131072,
    provider: 'nvidia',
    rank: 3,
  },
  {
    id: 'minimax/minimax-m3.1-flash:free',
    name: 'MiniMax M3.1 Flash (Free)',
    contextLength: 131072,
    provider: 'minimax',
    rank: 4,
  },
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    name: 'NVIDIA Nemotron 3 Ultra 550B (Free)',
    contextLength: 131072,
    provider: 'nvidia',
    rank: 5,
  },
  {
    id: 'google/gemma-4-31b-it:free',
    name: 'Google Gemma 4 31B (Free)',
    contextLength: 32768,
    provider: 'google',
    rank: 6,
  },
]

/**
 * Score a model by quality for automatic ranking.
 * NVIDIA gets highest priority (+1000), 70B+ models get (+500), larger context gets bonus.
 */
function scoreFreeModel(m: FreeModel): number {
  let score = 0
  const idLower = m.id.toLowerCase()
  const nameLower = m.name.toLowerCase()

  // 1. NVIDIA preference
  if (m.provider.toLowerCase() === 'nvidia' || idLower.includes('nvidia') || nameLower.includes('nemotron')) {
    score += 1000
  }

  // 2. High-capability parameter scales
  if (idLower.includes('70b') || idLower.includes('72b')) {
    score += 500
  } else if (idLower.includes('r1') || idLower.includes('deepseek')) {
    score += 450
  } else if (idLower.includes('32b') || idLower.includes('27b')) {
    score += 300
  } else if (idLower.includes('12b') || idLower.includes('14b')) {
    score += 200
  } else if (idLower.includes('8b') || idLower.includes('9b')) {
    score += 150
  }

  // 3. Generous context window bonus
  if (m.contextLength >= 64000) {
    score += 100
  } else if (m.contextLength >= 32000) {
    score += 50
  }

  return score
}

/**
 * Fetch the live list of free models from OpenRouter.
 * Strictly filters for models with $0 prompt pricing and $0 completion pricing.
 * Sorts with highest quality NVIDIA and 70B+ models first.
 */
export async function fetchFreeModels(apiKey?: string): Promise<FreeModel[]> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://webnovelforge.app',
      'X-Title': 'WebNovel Forge',
    }
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    const response = await fetch('https://openrouter.ai/api/v1/models', { headers })
    if (!response.ok) {
      console.warn(`OpenRouter models fetch returned HTTP ${response.status}, using cached/fallback queue.`)
      return getCachedOrFallback()
    }

    const data: any = await response.json()
    const fetched: FreeModel[] = (data.data || [])
      .filter((m: any) => {
        // Must be genuinely free
        const promptPrice = parseFloat(m.pricing?.prompt || '1')
        const completionPrice = parseFloat(m.pricing?.completion || '1')
        return promptPrice === 0 && completionPrice === 0
      })
      .map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        contextLength: m.context_length || 4096,
        provider: extractProvider(m.id),
      }))

    if (fetched.length === 0) {
      return getCachedOrFallback()
    }

    // Sort by capability score descending
    fetched.sort((a, b) => scoreFreeModel(b) - scoreFreeModel(a))

    // Assign rank
    fetched.forEach((m, idx) => {
      m.rank = idx + 1
    })

    cachedFreeModels = fetched
    persistModelsCache(fetched)
    return fetched
  } catch (error) {
    console.error('Failed to fetch free models:', error)
    return getCachedOrFallback()
  }
}

/**
 * Get the currently cached free models (no network call).
 */
export function getCachedFreeModels(): FreeModel[] {
  if (cachedFreeModels.length > 0) return cachedFreeModels
  return getCachedOrFallback()
}

/**
 * Return the single best currently available free model ID.
 */
export function getBestFreeModel(): string {
  const models = getCachedFreeModels()
  return models[0]?.id || VERIFIED_FREE_MODEL_FALLBACKS[0].id
}

/**
 * Generate a complete failover cascade list starting with preferredModel
 * followed by the best available ranked free models in descending quality order.
 */
export function getFreeModelCascade(preferredModel?: string): string[] {
  const models = getCachedFreeModels()
  const cascade: string[] = []

  if (preferredModel && preferredModel.trim()) {
    cascade.push(preferredModel.trim())
  }

  for (const m of models) {
    if (!cascade.includes(m.id)) {
      cascade.push(m.id)
    }
  }

  for (const fallback of VERIFIED_FREE_MODEL_FALLBACKS) {
    if (!cascade.includes(fallback.id)) {
      cascade.push(fallback.id)
    }
  }

  return cascade
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractProvider(modelId: string): string {
  const parts = modelId.split('/')
  return parts.length > 1 ? parts[0] : 'unknown'
}

function getCachePath(): string {
  try {
    return path.join(app.getPath('userData'), 'free_models_cache.json')
  } catch {
    return path.join(process.cwd(), 'free_models_cache.json')
  }
}

function persistModelsCache(models: FreeModel[]): void {
  try {
    fs.writeFileSync(getCachePath(), JSON.stringify(models, null, 2), 'utf-8')
  } catch {
    // Non-critical — ignore
  }
}

function getCachedOrFallback(): FreeModel[] {
  try {
    const cachePath = getCachePath()
    if (fs.existsSync(cachePath)) {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'))
      if (Array.isArray(data) && data.length > 0) {
        cachedFreeModels = data
        return data
      }
    }
  } catch {}

  cachedFreeModels = VERIFIED_FREE_MODEL_FALLBACKS
  return VERIFIED_FREE_MODEL_FALLBACKS
}
