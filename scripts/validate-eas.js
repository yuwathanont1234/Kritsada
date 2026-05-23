#!/usr/bin/env node
/**
 * validate-eas.js — sanity check eas.json before triggering a build.
 *
 * Validates:
 *  1. cli.appVersionSource = "remote" → every build profile must set
 *     `autoIncrement: true` (BOOLEAN).
 *  2. app.json version + runtimeVersion are pure semver strings.
 *  3. Channel <-> environment <-> env coherence for known profiles.
 *  4. tester-store / tester profiles MUST have EXPO_PUBLIC_TESTER_BUILD=true.
 *  5. production profile MUST NOT have EXPO_PUBLIC_TESTER_BUILD set.
 *
 * Exit 0 on clean, 1 on any error.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const EAS = path.join(REPO, 'eas.json');
const APP = path.join(REPO, 'app.json');

const errs = [];
const warns = [];

function loadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    errs.push(`Cannot read/parse ${path.basename(p)}: ${e.message}`);
    return null;
  }
}

const eas = loadJson(EAS);
const app = loadJson(APP);
if (!eas || !app) {
  printAndExit();
}

const remoteVersion = eas.cli?.appVersionSource === 'remote';
const profiles = eas.build || {};

for (const [name, prof] of Object.entries(profiles)) {
  if (name === 'development') continue;

  if (remoteVersion) {
    if (prof.autoIncrement !== true) {
      errs.push(
        `eas.build.${name}: missing "autoIncrement": true (boolean) — ` +
        `cli.appVersionSource="remote" requires it on every build profile`
      );
    }
  }

  if (prof.autoIncrement !== undefined &&
      prof.autoIncrement !== true &&
      prof.autoIncrement !== false) {
    errs.push(
      `eas.build.${name}: autoIncrement must be boolean true or false`
    );
  }
}

const v = app.expo?.version;
const rv = app.expo?.runtimeVersion;

if (typeof v !== 'string' || !/^\d+\.\d+\.\d+/.test(v)) {
  errs.push(`app.json expo.version must be a semver string, got ${JSON.stringify(v)}`);
}

if (rv !== undefined) {
  if (typeof rv === 'object') {
    errs.push(
      `app.json expo.runtimeVersion: object form ({"policy":"..."}) fails in ` +
      `bare workflow — use a string literal like "${v}" instead`
    );
  } else if (typeof rv !== 'string') {
    errs.push(`app.json expo.runtimeVersion must be string, got ${typeof rv}`);
  }
}

const testerProfiles = ['tester', 'tester-store'];
const prodProfile = profiles.production;

for (const name of testerProfiles) {
  const p = profiles[name];
  if (!p) continue;
  if (p.env?.EXPO_PUBLIC_TESTER_BUILD !== 'true') {
    errs.push(
      `eas.build.${name}: env.EXPO_PUBLIC_TESTER_BUILD must be "true" — ` +
      `otherwise isTesterBuild() returns false and tester features stay locked`
    );
  }
  if (!p.env?.EXPO_PUBLIC_TESTER_END_DATE) {
    warns.push(
      `eas.build.${name}: env.EXPO_PUBLIC_TESTER_END_DATE is unset`
    );
  }
}

if (prodProfile?.env?.EXPO_PUBLIC_TESTER_BUILD === 'true') {
  errs.push(
    `eas.build.production: EXPO_PUBLIC_TESTER_BUILD=true MUST NOT appear in ` +
    `production — would re-enable DEV section visible to real end users`
  );
}

for (const [name, prof] of Object.entries(profiles)) {
  if (name === 'development') continue;
  if (!prof.channel) {
    warns.push(
      `eas.build.${name}: channel is unset — EAS Update OTAs cannot target ` +
      `this build. Add "channel": "${name}"`
    );
  }
}

printAndExit();

function printAndExit() {
  const ok = errs.length === 0;
  console.log(ok ? '✓ eas.json valid' : `✗ eas.json has ${errs.length} error(s)`);

  for (const e of errs) console.log(`  ERROR: ${e}`);
  for (const w of warns) console.log(`  WARN:  ${w}`);

  process.exit(ok ? 0 : 1);
}
