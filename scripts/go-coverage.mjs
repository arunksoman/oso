#!/usr/bin/env node
// Runs the Go tests and fails when statement coverage is below the minimum.
//
// The server build tag swaps the native GUI for the headless Wails
// implementation, so the tests that need a running application work on every
// OS and without a display. frontend/dist must exist (it is embedded).
// cgo is switched off because on Linux Wails otherwise still links GTK and
// WebKit, which a headless machine does not have.
//
//   node scripts/go-coverage.mjs          # minimum 95%
//   GO_COVERAGE_MIN=90 node scripts/go-coverage.mjs
import { execFileSync, spawnSync } from 'node:child_process';

const minimum = Number(process.env.GO_COVERAGE_MIN ?? 95);
const profile = 'coverage.out';

const test = spawnSync(
  'go',
  ['test', '-tags', 'server', '-count=1', `-coverprofile=${profile}`, './...'],
  { stdio: 'inherit', env: { ...process.env, CGO_ENABLED: '0' } }
);
if (test.status !== 0) process.exit(test.status ?? 1);

const report = execFileSync('go', ['tool', 'cover', `-func=${profile}`], { encoding: 'utf8' });
const lines = report.trim().split('\n');
const total = Number(lines.at(-1).match(/([\d.]+)%/)?.[1]);

const gaps = lines.slice(0, -1).filter((line) => !line.includes('100.0%'));
if (gaps.length > 0) console.log(`\nNot fully covered:\n${gaps.join('\n')}`);
console.log(`\nGo coverage: ${total}% (minimum ${minimum}%)`);

if (!(total >= minimum)) {
  console.error(`Go coverage ${total}% is below the required ${minimum}%`);
  process.exit(1);
}
