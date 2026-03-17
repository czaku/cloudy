import { execa } from 'execa';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { TaskValidationOverrides, ValidationResult } from '../../core/types.js';

/**
 * Build strategy — intentionally a no-op for generic projects.
 *
 * Hardcoding `npm run build` assumes Node.js. Cloudy works with any language.
 * Use the `commands` array in your validation config:
 *
 *   "commands": ["cd web && bun run build"]
 *   "commands": ["cargo build"]
 *   "commands": ["make"]
 */
export async function runBuildCheck(_cwd: string): Promise<ValidationResult> {
  return {
    strategy: 'build',
    passed: true,
    output: 'Skipped: use validation.commands for project-specific build checks',
    durationMs: 0,
  };
}

/**
 * Determine from a list of changed file paths whether iOS or Android builds should run.
 * Returns the set of platform build checks that should be injected automatically.
 */
export function detectPlatformBuildNeeds(changedFiles: string[]): { ios: boolean; android: boolean } {
  const hasSwift = changedFiles.some((f) => f.endsWith('.swift'));
  const hasKotlin = changedFiles.some((f) => f.endsWith('.kt'));
  return { ios: hasSwift, android: hasKotlin };
}

/**
 * Auto-detect build commands for iOS based on the project structure.
 * Looks for an Xcode project and returns the xcodebuild command for the Dev scheme.
 */
async function findXcodeProject(cwd: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(path.join(cwd, 'apple'));
    const xcodeproj = entries.find((e) => e.endsWith('.xcodeproj'));
    if (xcodeproj) {
      return path.join('apple', xcodeproj);
    }
  } catch { /* apple/ dir not found */ }
  // Try cwd itself
  try {
    const entries = await fs.readdir(cwd);
    const xcodeproj = entries.find((e) => e.endsWith('.xcodeproj'));
    if (xcodeproj) return xcodeproj;
  } catch { /* ignore */ }
  return null;
}

async function runBuildCommand(command: string, cwd: string, label: string): Promise<ValidationResult> {
  const start = Date.now();
  try {
    const result = await execa(command, {
      cwd,
      reject: false,
      timeout: BUILD_TIMEOUT_MS,
      shell: true,
    });
    const passed = result.exitCode === 0;
    const output = passed
      ? `${label} passed`
      : `${label} failed (exit ${result.exitCode}):\n${(result.stderr || result.stdout || '').slice(0, 2000)}`;
    return { strategy: 'build', passed, output, durationMs: Date.now() - start };
  } catch (err) {
    return {
      strategy: 'build',
      passed: false,
      output: `${label} failed: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    };
  }
}

const BUILD_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Resolve the correct dev scheme name for the project.
 * Tries "ProjectName-Dev" first (legacy convention), then "ProjectName (Dev)".
 * Falls back to "ProjectName-Dev" if xcodebuild -list fails.
 */
async function resolveDevSchemeName(cwd: string, xcodeproj: string, projectName: string): Promise<string> {
  try {
    const result = await execa('xcodebuild', ['-project', xcodeproj, '-list'], {
      cwd,
      reject: false,
      timeout: 30_000,
    });
    const output = result.stdout || '';
    // Check which naming convention this project uses
    const dashDev = `${projectName}-Dev`;
    const parenDev = `${projectName} (Dev)`;
    if (output.includes(parenDev)) return parenDev;
    if (output.includes(dashDev)) return dashDev;
  } catch { /* fall through */ }
  // Default to legacy dash-Dev convention
  return `${projectName}-Dev`;
}

/**
 * Run an iOS build check using xcodebuild.
 * Finds the xcodeproj automatically. Returns a ValidationResult.
 */
export async function runIosBuildCheck(
  cwd: string,
  existingCommandLabels: string[],
  overrides?: TaskValidationOverrides,
): Promise<ValidationResult | null> {
  // Don't duplicate if a build check is already configured
  const alreadyHasIos = existingCommandLabels.some(
    (l) => l.toLowerCase().includes('ios') || l.toLowerCase().includes('xcode') || l.toLowerCase().includes('swift'),
  );
  if (alreadyHasIos) return null;

  if (overrides?.iosBuildCommand) {
    return runBuildCommand(overrides.iosBuildCommand, cwd, 'iOS build override');
  }

  const xcodeproj = await findXcodeProject(cwd);
  if (!xcodeproj) return null;

  const start = Date.now();
  const projectName = path.basename(xcodeproj, '.xcodeproj');

  // Resolve the dev scheme name — some projects use "Name-Dev", others "Name (Dev)"
  const schemeName = await resolveDevSchemeName(cwd, xcodeproj, projectName);

  // Build without running tests — just compilation check
  const args = [
    '-project', xcodeproj,
    '-scheme', schemeName,
    '-destination', 'generic/platform=iOS Simulator',
    'build',
    'CODE_SIGN_IDENTITY=', 'CODE_SIGNING_REQUIRED=NO', 'CODE_SIGNING_ALLOWED=NO',
  ];

  try {
    const result = await execa('xcodebuild', args, {
      cwd,
      reject: false,
      timeout: BUILD_TIMEOUT_MS,
    });
    const passed = result.exitCode === 0;
    const output = passed
      ? `iOS build (${schemeName}) passed`
      : `iOS build (${schemeName}) failed (exit ${result.exitCode}):\n${(result.stderr || result.stdout || '').slice(0, 2000)}`;
    return { strategy: 'build', passed, output, durationMs: Date.now() - start };
  } catch (err) {
    return {
      strategy: 'build',
      passed: false,
      output: `iOS build check failed: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Run an Android build check using Gradle.
 * Finds build.gradle.kts / build.gradle automatically.
 */
export async function runAndroidBuildCheck(
  cwd: string,
  existingCommandLabels: string[],
  overrides?: TaskValidationOverrides,
): Promise<ValidationResult | null> {
  // Don't duplicate if a build check is already configured
  const alreadyHasAndroid = existingCommandLabels.some(
    (l) => l.toLowerCase().includes('android') || l.toLowerCase().includes('gradle') || l.toLowerCase().includes('kotlin'),
  );
  if (alreadyHasAndroid) return null;

  if (overrides?.androidBuildCommand) {
    return runBuildCommand(overrides.androidBuildCommand, cwd, 'Android build override');
  }

  // Detect android dir — try google/ then android/
  let androidDir: string | null = null;
  for (const candidate of ['google', 'android']) {
    try {
      await fs.access(path.join(cwd, candidate, 'gradlew'));
      androidDir = candidate;
      break;
    } catch { /* not found */ }
  }
  if (!androidDir) return null;

  const start = Date.now();
  const gradlew = path.join(cwd, androidDir, 'gradlew');

  try {
    const result = await execa(gradlew, ['assembleDebug', '--no-daemon', '-q'], {
      cwd: path.join(cwd, androidDir),
      reject: false,
      timeout: BUILD_TIMEOUT_MS,
    });
    const passed = result.exitCode === 0;
    const output = passed
      ? `Android build (assembleDebug) passed`
      : `Android build (assembleDebug) failed (exit ${result.exitCode}):\n${(result.stderr || result.stdout || '').slice(0, 2000)}`;
    return { strategy: 'build', passed, output, durationMs: Date.now() - start };
  } catch (err) {
    return {
      strategy: 'build',
      passed: false,
      output: `Android build check failed: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    };
  }
}
