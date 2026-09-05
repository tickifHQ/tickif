import { installProviderDoubles } from './provider-doubles.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

installProviderDoubles(false);
await import(pathToFileURL(resolve('../apps/worker/dist/index.js')).href);
