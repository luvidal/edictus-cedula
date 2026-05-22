import { getLogger } from './config'

/**
 * Safe JSON parse with error capture.
 * Returns null on parse error instead of throwing.
 */
export function safeJsonParse<T>(
  json: string | null | undefined,
  context?: Record<string, unknown>
): T | null {
  if (!json) return null

  try {
    return JSON.parse(json) as T
  } catch (error) {
    getLogger().error(error, {
      ...context,
      action: (context?.action as string) || 'json_parse',
      jsonPreview: json.slice(0, 200),
    })
    return null
  }
}
