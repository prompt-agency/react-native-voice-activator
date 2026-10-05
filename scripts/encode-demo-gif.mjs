#!/usr/bin/env node
/**
 * Turns a raw screen recording of the example app's Demo tab into the assets
 * the README and the React Native Directory entry use.
 *
 * The directory renders `images` entries inline on the library page, so an
 * oversized GIF is a slow page for everyone browsing it. This script therefore
 * encodes with a per-clip palette and fails if the result is over the budget,
 * rather than quietly shipping a 12 MB file.
 *
 * Usage:
 *   node scripts/encode-demo-gif.mjs <input.mov> [options]
 *
 * Options:
 *   --start <seconds>     Trim this much off the front (default 0)
 *   --duration <seconds>  Keep only this many seconds (default: to the end)
 *   --crop <W:H:X:Y>      ffmpeg crop, applied before scaling
 *   --crop-content        Shorthand for the Demo screen's content band
 *   --width <px>          Output width, height follows aspect (default 480)
 *   --fps <n>             Output frame rate (default 12)
 *   --max-bytes <n>       Budget for the GIF (default 1000000)
 *   --out-dir <path>      Where to write (default docs/assets)
 *   --name <basename>     Output basename (default "demo")
 *
 * Writes <out-dir>/<name>.gif and <out-dir>/<name>.mp4. The mp4 is for the
 * README, where a video tag beats a GIF on both size and quality; the GIF is
 * for the directory, whose schema only accepts image URLs.
 */

import { spawn } from 'node:child_process';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ─── Arguments ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const input = argv.find((a) => !a.startsWith('--'));

if (!input) {
  console.error(
    'Usage: node scripts/encode-demo-gif.mjs <input.mov> [--start n] [--duration n]\n' +
      '       [--crop W:H:X:Y | --crop-content] [--width px] [--fps n] [--max-bytes n]'
  );
  process.exit(1);
}

function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = argv[i + 1];
  if (value === undefined || value.startsWith('--')) {
    console.error(`--${name} needs a value.`);
    process.exit(1);
  }
  return value;
}

function numberFlag(name, fallback) {
  const raw = flag(name, null);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    console.error(`--${name} must be a non-negative number, got "${raw}".`);
    process.exit(1);
  }
  return value;
}

const start = numberFlag('start', 0);
const duration = flag('duration', null);
const width = numberFlag('width', 480);
const fps = numberFlag('fps', 12);
const maxBytes = numberFlag('max-bytes', 1_000_000);
// resolve(), not join(): an absolute --out-dir has to stay absolute rather
// than being appended to the repo root.
const outDir = resolve(ROOT, flag('out-dir', join('docs', 'assets')));
const name = flag('name', 'demo');

// The simulator records the whole window: status bar, tab bar, and a lot of
// background above and below the content. Cropping to the content band is both
// what makes the still readable and the cheapest way to cut bytes, since it
// removes pixels before anything else in the chain runs.
//
// Measured against the Demo screen on an iPhone 17 simulator (1206x2622): the
// band runs from just above "WAKE PHRASE" to just below the button. Pass an
// explicit --crop instead for any other device.
const crop = argv.includes('--crop-content')
  ? 'in_w:1670:0:690'
  : flag('crop', null);

// ─── ffmpeg ───────────────────────────────────────────────────────────────────

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (cause) => {
      if (cause.code === 'ENOENT') {
        reject(
          new Error(
            'ffmpeg not found on PATH. Install it with `brew install ffmpeg`.'
          )
        );
        return;
      }
      reject(cause);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      // ffmpeg writes everything to stderr, so only the tail is useful.
      reject(
        new Error(
          `ffmpeg exited with code ${code}:\n${stderr.split('\n').slice(-18).join('\n')}`
        )
      );
    });
  });
}

/** Trim flags go before -i so ffmpeg seeks rather than decodes and discards. */
const trim = [
  ...(start > 0 ? ['-ss', String(start)] : []),
  ...(duration !== null ? ['-t', duration] : []),
];

const chain = [
  ...(crop ? [`crop=${crop}`] : []),
  `fps=${fps}`,
  `scale=${width}:-2:flags=lanczos`,
];

await mkdir(outDir, { recursive: true });

const gifPath = join(outDir, `${name}.gif`);
const mp4Path = join(outDir, `${name}.mp4`);
const palettePath = join(outDir, `.${name}-palette.png`);

// ─── Pass 1: palette ──────────────────────────────────────────────────────────
//
// A UI recording is flat colour with sharp text, so a generated 256-colour
// palette is effectively lossless here, where the default web palette would
// band the dark hero panel.

console.log('Generating palette...');
await run([
  '-y',
  ...trim,
  '-i',
  input,
  '-vf',
  `${chain.join(',')},palettegen=stats_mode=diff`,
  palettePath,
]);

// ─── Pass 2: GIF ──────────────────────────────────────────────────────────────
//
// bayer dithering rather than the default floyd_steinberg: error diffusion
// invents per-frame noise in flat areas, which defeats inter-frame compression
// and roughly doubles the file for footage like this.

console.log('Encoding GIF...');
await run([
  '-y',
  ...trim,
  '-i',
  input,
  '-i',
  palettePath,
  '-lavfi',
  `${chain.join(',')}[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`,
  '-loop',
  '0',
  gifPath,
]);

await rm(palettePath, { force: true });

// ─── mp4 ──────────────────────────────────────────────────────────────────────

console.log('Encoding mp4...');
await run([
  '-y',
  ...trim,
  '-i',
  input,
  '-vf',
  `${chain.join(',')},scale=trunc(iw/2)*2:trunc(ih/2)*2`,
  '-an',
  '-c:v',
  'libx264',
  '-profile:v',
  'main',
  '-pix_fmt',
  'yuv420p',
  '-crf',
  '26',
  '-movflags',
  '+faststart',
  mp4Path,
]);

// ─── Report ───────────────────────────────────────────────────────────────────

const gifBytes = (await stat(gifPath)).size;
const mp4Bytes = (await stat(mp4Path)).size;

const mb = (n) => `${(n / 1e6).toFixed(2)} MB`;

/** Repo-relative while the output is inside the repo, absolute once it escapes. */
function display(path) {
  const rel = relative(ROOT, path);
  return rel.startsWith('..') ? path : rel;
}

console.log(`\n${display(gifPath)}  ${mb(gifBytes)}`);
console.log(`${display(mp4Path)}  ${mb(mp4Bytes)}`);

if (gifBytes > maxBytes) {
  console.error(
    `\nGIF is ${mb(gifBytes)}, over the ${mb(maxBytes)} budget.\n` +
      'Shortest path down, in the order that costs the least quality:\n' +
      '  1. --duration: trim to the single detection, 8-12s is plenty\n' +
      `  2. --crop-content or --crop: fewer pixels beats fewer colours\n` +
      `  3. --fps 10\n` +
      `  4. --width 400`
  );
  process.exit(1);
}

console.log(`\nWithin the ${mb(maxBytes)} budget.`);
