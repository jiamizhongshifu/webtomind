#!/usr/bin/env node

const [major = '0', minor = '0', patch = '0'] = process.versions.node
  .split('.')
  .map((part) => Number.parseInt(part, 10));

if (major !== 24) {
  console.error(
    `WebToMind requires Node 24.x; current runtime is ${process.versions.node}. ` +
      'Use the version pinned in .node-version before installing or validating.'
  );
  process.exit(1);
}

console.log(`Node runtime OK: ${major}.${minor}.${patch}`);
