import { installProviderDoubles } from './provider-doubles.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

installProviderDoubles(true);
await import(pathToFileURL(resolve('../apps/api/dist/server.js')).href);
