import { existsSync, readFileSync, writeFileSync } from 'fs';
import nodePath from 'path';

const CLASH = [
  '@nomad-xyz/sdk',
  '@nomiclabs/hardhat-ethers',
  '@typechain/ethers-v5',
];

export interface PackageJsonResult {
  changed: boolean;
  warnings: string[];
}

export function updatePackageJson(root: string): PackageJsonResult {
  const file = nodePath.join(root, 'package.json');
  if (!existsSync(file)) return { changed: false, warnings: [] };

  const raw = readFileSync(file, 'utf-8');
  const pkg = JSON.parse(raw);
  const warnings: string[] = [];
  let changed = false;

  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const deps = pkg[field];
    if (!deps) continue;

    if (deps.ethers && /^[\^~]?5\./.test(deps.ethers)) {
      deps.ethers = '^6.13.0';
      changed = true;
    }

    for (const name of Object.keys(deps)) {
      if (name.startsWith('@ethersproject/') || CLASH.includes(name)) {
        warnings.push(`${field}: ${name} may clash with ethers v6`);
      }
    }
  }

    if (changed) {
    const indent = raw.match(/^[ \t]+(?=")/m)?.[0] ?? '  ';
    const eol = raw.includes('\r\n') ? '\r\n' : '\n';
    const out = JSON.stringify(pkg, null, indent).replace(/\n/g, eol) + eol;
    writeFileSync(file, out, 'utf-8');
  }

  return { changed, warnings };
}