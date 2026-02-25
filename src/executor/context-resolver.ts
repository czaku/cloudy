import fs from 'node:fs/promises';
import path from 'node:path';
import { log } from '../utils/logger.js';

export interface ContextFile {
  path: string;
  content: string;
}

/**
 * Resolve an array of glob patterns to actual file paths,
 * read each file, and return an array of { path, content } objects.
 */
export { resolveContextFiles as resolveContextPatterns };

/**
 * Simple glob pattern matcher supporting * and ** wildcards.
 * Works without external dependencies.
 */
function matchGlob(filePath: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexStr = pattern
    .split('**')
    .map((segment) =>
      segment
        .split('*')
        .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]*'),
    )
    .join('.*');
  return new RegExp(`^${regexStr}$`).test(filePath);
}

export async function resolveContextFiles(
  contextPatterns: string[],
  cwd: string,
  budgetTokens = 0,
): Promise<ContextFile[]> {
  if (contextPatterns.length === 0) return [];

  const resolvedFiles: ContextFile[] = [];
  const seen = new Set<string>();
  let totalChars = 0; // ~4 chars per token

  // Get all files in the project once (recursive readdir, available Node 18.17+)
  let allFiles: string[] = [];
  try {
    const entries = await fs.readdir(cwd, { recursive: true });
    allFiles = entries.map((e) => (typeof e === 'string' ? e : String(e)));
  } catch {
    return [];
  }

  for (const pattern of contextPatterns) {
    // Patterns with glob wildcards go straight to glob matching
    const hasWildcard = pattern.includes('*') || pattern.includes('?') ||
      pattern.includes('[') || pattern.includes('{');

    if (!hasWildcard) {
    // Check if pattern is a literal file path first
    const literalPath = path.isAbsolute(pattern)
      ? pattern
      : path.join(cwd, pattern);

    try {
      const stat = await fs.stat(literalPath);
      if (stat.isFile()) {
        const filePath = path.resolve(literalPath);
        if (!seen.has(filePath) && stat.size <= 100_000) {
          seen.add(filePath);
          const content = await fs.readFile(filePath, 'utf-8');
          if (budgetTokens > 0 && (totalChars + content.length) / 4 > budgetTokens) {
            await log.info(`Context budget (${budgetTokens} tokens) reached — skipping ${path.relative(cwd, filePath)}`);
            continue;
          }
          totalChars += content.length;
          resolvedFiles.push({ path: path.relative(cwd, filePath), content });
        }
        continue;
      }
    } catch {
      // Not a literal path, try as glob pattern
    }
    } // end if (!hasWildcard)

    // Match against all files using glob pattern
    for (const relFile of allFiles) {
      if (matchGlob(relFile, pattern)) {
        const filePath = path.resolve(cwd, relFile);
        if (seen.has(filePath)) continue;
        seen.add(filePath);

        const stat = await fs.stat(filePath).catch(() => null);
        if (!stat || !stat.isFile()) continue;
        if (stat.size > 100_000) {
          await log.info(`Skipping large file (${stat.size} bytes): ${filePath}`);
          continue;
        }

        try {
          const content = await fs.readFile(filePath, 'utf-8');
          if (budgetTokens > 0 && (totalChars + content.length) / 4 > budgetTokens) {
            await log.info(`Context budget (${budgetTokens} tokens) reached — skipping ${relFile}`);
            continue;
          }
          totalChars += content.length;
          resolvedFiles.push({ path: relFile, content });
        } catch {
          await log.info(`Could not read file: ${filePath}`);
        }
      }
    }
  }

  return resolvedFiles;
}

/**
 * Map a file extension to a markdown language tag for syntax highlighting.
 */
function langForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.rb': 'ruby',
    '.java': 'java',
    '.kt': 'kotlin',
    '.swift': 'swift',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.css': 'css',
    '.scss': 'scss',
    '.html': 'html',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.toml': 'toml',
    '.md': 'markdown',
    '.sql': 'sql',
    '.sh': 'bash',
    '.bash': 'bash',
    '.zsh': 'bash',
    '.dockerfile': 'dockerfile',
  };

  // Handle Dockerfile specifically
  if (path.basename(filePath).toLowerCase() === 'dockerfile') {
    return 'dockerfile';
  }

  return map[ext] ?? '';
}

/**
 * Format resolved context files into a markdown section suitable
 * for inclusion in a prompt.
 *
 * Example output:
 *
 *   # Context Files
 *   ## web/src/components/RunHistory.tsx
 *   ```typescript
 *   [file content]
 *   ```
 *   ## api/routes.py
 *   ```python
 *   [file content]
 *   ```
 */
export function buildContextSection(files: ContextFile[]): string {
  if (files.length === 0) return '';

  const parts: string[] = ['# Context Files\n'];

  for (const file of files) {
    const lang = langForFile(file.path);
    parts.push(`## ${file.path}`);
    parts.push(`\`\`\`${lang}`);
    parts.push(file.content);
    parts.push('```\n');
  }

  return parts.join('\n');
}

/**
 * Given existing context patterns, expand them by finding related files:
 * - Sibling files in the same directories
 * - Files imported/referenced by the existing context files
 *
 * This is useful on retry: if the first attempt failed, we can broaden
 * the context to give the executor more information.
 */
export async function expandContext(
  existingPatterns: string[],
  cwd: string,
  budgetTokens = 0,
): Promise<string[]> {
  const expanded = new Set<string>(existingPatterns);

  // First resolve what we already have
  const currentFiles = await resolveContextFiles(existingPatterns, cwd, budgetTokens);

  for (const file of currentFiles) {
    const absolutePath = path.resolve(cwd, file.path);
    const dir = path.dirname(absolutePath);

    // Add sibling files in the same directory (non-recursive)
    const siblingPattern = path.relative(cwd, path.join(dir, '*'));
    expanded.add(siblingPattern);

    // Scan for import/require references and add those files
    const imports = extractImports(file.content, file.path);
    for (const imp of imports) {
      const resolvedImport = resolveImportPath(imp, absolutePath, cwd);
      if (resolvedImport) {
        expanded.add(resolvedImport);
      }
    }
  }

  return Array.from(expanded);
}

/**
 * Extract import paths from file content based on common patterns:
 *   - ES imports: import ... from '...'
 *   - CommonJS: require('...')
 *   - Python: from X import Y / import X
 */
function extractImports(content: string, filePath: string): string[] {
  const imports: string[] = [];

  const ext = path.extname(filePath).toLowerCase();

  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
    // ES import: import ... from '...'
    const esImportRe = /(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = esImportRe.exec(content)) !== null) {
      imports.push(match[1]);
    }
    // Dynamic import / require
    const requireRe = /(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRe.exec(content)) !== null) {
      imports.push(match[1]);
    }
  } else if (ext === '.py') {
    // Python: from X.Y import Z  ->  X/Y.py
    const fromImportRe = /from\s+([\w.]+)\s+import/g;
    let match: RegExpExecArray | null;
    while ((match = fromImportRe.exec(content)) !== null) {
      imports.push(match[1].replace(/\./g, '/'));
    }
  }

  return imports;
}

/**
 * Try to resolve a relative import string to a path relative to cwd.
 * Returns null if the import looks like a package (not a relative path).
 */
function resolveImportPath(
  importPath: string,
  fromFile: string,
  cwd: string,
): string | null {
  // Skip package imports (no leading ./ or ../)
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    // Could be a Python relative import — check if it resolves to a local file
    const candidate = path.resolve(cwd, importPath);
    const relCandidate = path.relative(cwd, candidate);
    // Only include if it stays within the project
    if (!relCandidate.startsWith('..')) {
      return `${relCandidate}.*`;
    }
    return null;
  }

  const dir = path.dirname(fromFile);
  const resolved = path.resolve(dir, importPath);
  const relative = path.relative(cwd, resolved);

  // Don't include paths that escape the project
  if (relative.startsWith('..')) return null;

  // For JS/TS imports without extension, add wildcard to match .ts/.tsx/.js etc.
  if (!path.extname(relative)) {
    return `${relative}.*`;
  }

  return relative;
}
