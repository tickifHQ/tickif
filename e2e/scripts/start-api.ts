import './provider-doubles.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

await import(pathToFileURL(resolve('../apps/api/dist/server.js')).href);
