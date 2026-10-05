import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const e2eJavaHome = findJava21Home();
const configuredChrome = process.env.HERMES_E2E_CHROME_PATH;
const relocatedChrome = '/Users/Shared/Relocated Items/Security/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const nativeChrome = process.platform === 'darwin'
  ? [configuredChrome, relocatedChrome].find((candidate) => candidate && existsSync(candidate))
  : undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:18080',
    ...devices['Desktop Chrome'],
    launchOptions: nativeChrome ? { executablePath: nativeChrome } : undefined,
  },
  webServer: {
    command: `env HERMES_E2E_JAVA_HOME=${JSON.stringify(e2eJavaHome)} ../../scripts/start-e2e-stack.sh`,
    env: {
      ...process.env,
      HERMES_E2E_JAVA_HOME: e2eJavaHome,
      PATH: `${e2eJavaHome}/bin:${process.env.PATH}`,
    },
    url: 'http://127.0.0.1:18080/actuator/health',
    reuseExistingServer: false,
    timeout: 240_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
  },
});

function findJava21Home(): string {
  const configured = [process.env.HERMES_JAVA21_HOME, process.env.JAVA_HOME];
  const toolingRoot = resolve(repositoryRoot, '.tooling');
  const local = existsSync(toolingRoot)
    ? readdirSync(toolingRoot)
      .filter((name) => name.startsWith('jdk-21'))
      .map((name) => resolve(toolingRoot, name, 'Contents/Home'))
    : [];
  for (const home of [...local, ...configured]) {
    if (!home) continue;
    const executable = resolve(home, 'bin/java');
    if (!existsSync(executable)) continue;
    try {
      const result = spawnSync(executable, ['-version'], { encoding: 'utf8' });
      const version = `${result.stdout ?? ''}${result.stderr ?? ''}`;
      if (result.status === 0 && version.includes('version "21')) return home;
    } catch {
      // Try the next explicitly bounded candidate.
    }
  }
  throw new Error('A Java 21 runtime is required for authenticated E2E');
}
