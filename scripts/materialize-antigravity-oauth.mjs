import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const clientId = process.env.ANTIGRAVITY_OAUTH_CLIENT_ID?.trim();
const clientSecret = process.env.ANTIGRAVITY_OAUTH_CLIENT_SECRET?.trim();
if (!clientId || !clientSecret) {
  throw new Error('ANTIGRAVITY_OAUTH_CLIENT_ID and ANTIGRAVITY_OAUTH_CLIENT_SECRET are required for publishing');
}
if (!clientId.endsWith('.apps.googleusercontent.com')) {
  throw new Error('ANTIGRAVITY_OAUTH_CLIENT_ID does not look like a Google OAuth client id');
}

const replacements = new Map([
  ['__ANTIGRAVITY_OAUTH_CLIENT_ID__', clientId],
  ['__ANTIGRAVITY_OAUTH_CLIENT_SECRET__', clientSecret],
]);
const files = [
  resolve('packages/plugin-providers/index.js'),
  resolve('packages/plugin-providers/login.js'),
];
for (const file of files) {
  let source = await readFile(file, 'utf8');
  for (const [placeholder, value] of replacements) {
    const occurrences = source.split(placeholder).length - 1;
    if (occurrences !== 1) throw new Error(`${file}: expected exactly one ${placeholder}, found ${occurrences}`);
    source = source.replace(placeholder, value);
  }
  if (source.includes('__ANTIGRAVITY_OAUTH_')) throw new Error(`${file}: OAuth placeholder remains`);
  await writeFile(file, source, 'utf8');
}
console.log('Materialized Antigravity OAuth credentials in the ephemeral publish workspace.');
