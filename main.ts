// SOLMAR — the entry point that hands the game in (Node 22, standard library
// only). It copies this repository's game/ and screenshots/ beside it into the
// output directory — /output in the grader, or $MAKEFUN_OUTPUT_DIR anywhere
// else — and writes /output/dossier.json with the make.fun library, so the
// judge reads the same summary the gate rebuilds. Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository root is the directory this file lives in.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Copy a directory when it exists, creating the destination first. */
function copyTreeIfPresent(name: string): void {
  const from = join(repoRoot, name);
  if (!existsSync(from)) return;
  const to = join(outDir, name);
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

function handIn(): void {
  mkdirSync(outDir, { recursive: true });
  copyTreeIfPresent('game');
  copyTreeIfPresent('screenshots');

  // The gate's caps, as the dossier builder takes them: the text budget shapes
  // the bytes; the rest refuse an entry the scorer would refuse anyway.
  const dossier = buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);
}

handIn();
