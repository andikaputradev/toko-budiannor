import { resetArtifacts } from './helpers/artifacts';

export default async function globalSetup(): Promise<void> {
  await resetArtifacts();
}
