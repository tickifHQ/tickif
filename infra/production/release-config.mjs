import { pathToFileURL } from 'node:url';

// This standalone CI entry point does not load application runtime secrets.
export function releaseConfig(env) {
  if (!['refs/heads/main', 'refs/heads/staging'].includes(env.GITHUB_REF)) {
    throw new Error('Release builds require main or staging');
  }
  if (!/^[0-9a-f]{40}$/.test(env.GITHUB_SHA ?? '')) {
    throw new Error('A full commit SHA is required');
  }
  const production = env.GITHUB_REF === 'refs/heads/main';
  const host = production ? env.PRODUCTION_HOST : env.STAGING_HOST;
  if (!host || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host)) {
    throw new Error('Configure the release environment hostname without a URL scheme');
  }
  if (production && !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_NUMBER ?? '')) {
    throw new Error('Production releases require a positive CI run number');
  }
  return {
    host,
    image_tag: production ? `production-${env.GITHUB_SHA}` : env.GITHUB_SHA,
    version: production ? `v0.1.${env.GITHUB_RUN_NUMBER}` : env.GITHUB_SHA,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [key, value] of Object.entries(releaseConfig(process.env))) {
    console.log(`${key}=${value}`);
  }
}
