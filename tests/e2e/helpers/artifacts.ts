import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const ARTIFACT_ROOT = join(process.cwd(), 'verifikasi');

export async function resetArtifacts(): Promise<void> {
  await rm(ARTIFACT_ROOT, { recursive: true, force: true });
  await mkdir(ARTIFACT_ROOT, { recursive: true });
}

export function artifactPath(...parts: string[]): string {
  return join(ARTIFACT_ROOT, ...parts);
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
