import path from 'path'

/**
 * Validates that childPath is strictly located inside parentPath.
 * Prevents directory traversal attacks (e.g. `../../etc/passwd`).
 */
export function isSafeSubpath(parentPath: string, childPath: string): boolean {
  if (!parentPath || !childPath) return false
  const resolvedParent = path.resolve(parentPath)
  const resolvedTarget = path.resolve(parentPath, childPath)

  return (
    resolvedTarget === resolvedParent ||
    resolvedTarget.startsWith(resolvedParent + path.sep)
  )
}

/**
 * Asserts that childPath is safely within parentPath.
 * Throws an Error if a directory traversal attempt is detected.
 */
export function assertSafeSubpath(parentPath: string, childPath: string): string {
  if (!isSafeSubpath(parentPath, childPath)) {
    throw new Error(`Security Violation: Path traversal detected outside boundary [${parentPath}]`)
  }
  return path.resolve(parentPath, childPath)
}

/**
 * Validates that a slug contains only safe alphanumeric and hyphen/underscore characters.
 * Prevents shell command injection and filesystem manipulation.
 */
export function sanitizeSlug(slug: string): string {
  if (!slug || typeof slug !== 'string') {
    throw new Error('Invalid slug: must be a non-empty string')
  }
  const trimmed = slug.trim()
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    throw new Error(`Security Violation: Unsafe slug containing invalid characters: "${slug}"`)
  }
  return trimmed
}

/**
 * Guards against raw SQL injection and dangerous administrative commands.
 * Disallows query chaining (semicolons outside string literals) and administrative pragmas/drops.
 */
export function validateSqlQuery(sql: string): void {
  if (!sql || typeof sql !== 'string') {
    throw new Error('Invalid SQL: Query must be a non-empty string')
  }

  const trimmed = sql.trim()
  // Reject multiple statements (query stacking)
  // Check for semicolons that aren't at the very end
  const withoutTrailingSemicolon = trimmed.replace(/;+\s*$/, '')
  if (withoutTrailingSemicolon.includes(';')) {
    throw new Error('Security Violation: Multiple stacked SQL statements are forbidden')
  }

  // Reject destructive/administrative commands
  const upper = trimmed.toUpperCase()
  const forbiddenPatterns = [
    /\bATTACH\b/i,
    /\bDETACH\b/i,
    /\bPRAGMA\s+writable_schema\b/i,
    /\bDROP\s+TABLE\b/i,
    /\bDROP\s+DATABASE\b/i,
    /\bALTER\s+TABLE\b/i,
  ]

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(upper)) {
      throw new Error(`Security Violation: Administrative or destructive SQL command forbidden: ${pattern}`)
    }
  }
}
