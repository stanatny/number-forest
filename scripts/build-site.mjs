import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.local', 'site');
const runtime = ['index.html', 'src', 'styles', 'assets', 'LICENSE'];
const changes = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', ...runtime], { cwd: root, encoding: 'utf8' });
if (changes.trim()) throw new Error('Commit the runtime files before preparing a release snapshot.');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of runtime) await cp(path.join(root, entry), path.join(output, entry), { recursive: true });
await writeFile(path.join(output, '.nojekyll'), '');
await writeFile(path.join(output, 'version.json'), JSON.stringify({ version: '0.1.0', sourceCommit: commit }, null, 2) + '\n');
console.log(`Static site prepared in ${output}\nSource commit: ${commit}`);
