import { describe, it, expect } from 'vitest';
import { parseDiffHunks, mergeRanges } from '../../src/validator/validator.js';

// ── parseDiffHunks ────────────────────────────────────────────────────────────

describe('parseDiffHunks', () => {
  it('returns empty map for empty diff', () => {
    const result = parseDiffHunks('');
    expect(result.size).toBe(0);
  });

  it('parses a single hunk in a single file', () => {
    const diff = `
diff --git a/api/routes.py b/api/routes.py
index abc123..def456 100644
--- a/api/routes.py
+++ b/api/routes.py
@@ -10,6 +10,10 @@ class Router:
 existing line
+new line 1
+new line 2
+new line 3
+new line 4
 another line
`.trim();

    const result = parseDiffHunks(diff);
    expect(result.has('api/routes.py')).toBe(true);
    const hunks = result.get('api/routes.py')!;
    expect(hunks).toHaveLength(1);
    expect(hunks[0].start).toBe(10);
    expect(hunks[0].end).toBe(19); // 10 + 10 - 1
  });

  it('parses multiple hunks in the same file', () => {
    const diff = `
diff --git a/api/orchestrator.py b/api/orchestrator.py
--- a/api/orchestrator.py
+++ b/api/orchestrator.py
@@ -100,5 +100,8 @@ def foo():
 line
+added
 line
@@ -2330,6 +2333,80 @@ class Orchestrator:
 existing
+new message code
`.trim();

    const result = parseDiffHunks(diff);
    const hunks = result.get('api/orchestrator.py')!;
    expect(hunks).toHaveLength(2);
    expect(hunks[0].start).toBe(100);
    expect(hunks[1].start).toBe(2333);
  });

  it('parses hunks across multiple files', () => {
    const diff = `
diff --git a/api/routes.py b/api/routes.py
--- a/api/routes.py
+++ b/api/routes.py
@@ -50,3 +50,6 @@
 line
+added
diff --git a/web/src/components/Inbox.tsx b/web/src/components/Inbox.tsx
--- a/web/src/components/Inbox.tsx
+++ b/web/src/components/Inbox.tsx
@@ -1,4 +1,8 @@
+import React from 'react';
 existing
`.trim();

    const result = parseDiffHunks(diff);
    expect(result.size).toBe(2);
    expect(result.has('api/routes.py')).toBe(true);
    expect(result.has('web/src/components/Inbox.tsx')).toBe(true);
  });

  it('handles hunk with count of 0 (file deletion/new file edge case)', () => {
    const diff = `
diff --git a/newfile.ts b/newfile.ts
--- /dev/null
+++ b/newfile.ts
@@ -0,0 +1,5 @@
+line 1
+line 2
`.trim();

    const result = parseDiffHunks(diff);
    const hunks = result.get('newfile.ts')!;
    expect(hunks).toHaveLength(1);
    expect(hunks[0].start).toBe(1);
  });

  it('handles hunk header without explicit count (single-line change)', () => {
    // @@ -5 +5 @@ — no comma, count defaults to 1
    const diff = `
+++ b/src/util.ts
@@ -5 +5 @@
-old
+new
`.trim();

    const result = parseDiffHunks(diff);
    const hunks = result.get('src/util.ts')!;
    expect(hunks[0].start).toBe(5);
    expect(hunks[0].end).toBe(5); // start + max(1-1, 0) = 5
  });

  it('ignores lines that are not hunk headers or file paths', () => {
    const diff = `
diff --git a/foo.ts b/foo.ts
index aaa..bbb 100644
--- a/foo.ts
+++ b/foo.ts
@@ -1,3 +1,4 @@
 context line
+added line
-removed line
 another context
`.trim();

    const result = parseDiffHunks(diff);
    expect(result.size).toBe(1);
    expect(result.get('foo.ts')).toHaveLength(1);
  });

  it('key insight: finds code at line 2330 in a 125KB file, not just the first 200 lines', () => {
    // This is the exact scenario that caused TASK-1804 (orchestrator.py) to fail validation
    const diff = `
diff --git a/api/orchestrator.py b/api/orchestrator.py
--- a/api/orchestrator.py
+++ b/api/orchestrator.py
@@ -2337,6 +2337,74 @@ class TaskOrchestrator:
             try:
+                await send_message(
+                    from_agent="space",
+                    to_agent="area",
`.trim();

    const result = parseDiffHunks(diff);
    const hunks = result.get('api/orchestrator.py')!;
    // Should find changes at line 2337, not assume they're at the start
    expect(hunks[0].start).toBe(2337);
    expect(hunks[0].end).toBeGreaterThan(2337);
  });
});

// ── mergeRanges ───────────────────────────────────────────────────────────────

describe('mergeRanges', () => {
  it('returns empty array for empty input', () => {
    expect(mergeRanges([])).toEqual([]);
  });

  it('returns a single range unchanged', () => {
    expect(mergeRanges([{ start: 10, end: 20 }])).toEqual([{ start: 10, end: 20 }]);
  });

  it('merges two overlapping ranges', () => {
    const result = mergeRanges([
      { start: 10, end: 30 },
      { start: 25, end: 50 },
    ]);
    expect(result).toEqual([{ start: 10, end: 50 }]);
  });

  it('merges adjacent ranges (end+1 == next start)', () => {
    const result = mergeRanges([
      { start: 10, end: 20 },
      { start: 21, end: 30 },
    ]);
    expect(result).toEqual([{ start: 10, end: 30 }]);
  });

  it('does not merge non-overlapping ranges', () => {
    const result = mergeRanges([
      { start: 10, end: 20 },
      { start: 50, end: 60 },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ start: 10, end: 20 });
    expect(result[1]).toEqual({ start: 50, end: 60 });
  });

  it('handles unsorted input (sorts before merging)', () => {
    const result = mergeRanges([
      { start: 50, end: 60 },
      { start: 10, end: 20 },
      { start: 15, end: 25 },
    ]);
    expect(result).toEqual([
      { start: 10, end: 25 },
      { start: 50, end: 60 },
    ]);
  });

  it('merges three overlapping ranges into one', () => {
    const result = mergeRanges([
      { start: 100, end: 150 },
      { start: 140, end: 200 },
      { start: 190, end: 250 },
    ]);
    expect(result).toEqual([{ start: 100, end: 250 }]);
  });

  it('realistic: two diff hunks with 40-line context windows that overlap', () => {
    // Hunk at line 100 (±40 context) and hunk at line 125 (±40 context)
    const result = mergeRanges([
      { start: 60, end: 140 },  // hunk at 100, context 40 each side
      { start: 85, end: 165 },  // hunk at 125, context 40 each side
    ]);
    // They overlap (60-140 and 85-165), so should merge
    expect(result).toEqual([{ start: 60, end: 165 }]);
  });

  it('realistic: two distant hunks that stay separate after context expansion', () => {
    // Hunk at line 50 and hunk at line 2337 — far apart, should NOT merge
    const result = mergeRanges([
      { start: 10, end: 90 },     // hunk at 50, ±40 context
      { start: 2297, end: 2417 }, // hunk at 2337, ±40 context
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].end).toBeLessThan(result[1].start);
  });
});
