#!/usr/bin/env node

import {build, createServer} from 'vite';
import electronPath from 'electron';
import {spawn} from 'child_process';
import path from 'path';

/** @type 'development' */
const mode = 'development';
process.env.NODE_ENV = mode;
process.env.MODE = mode;

/** @type {import('vite').LogLevel} */
const logLevel = 'warn';

/**
 * Setup watcher for `main` package
 * On file changed it totally re-launch electron app.
 * @param {import('vite').ViteDevServer} watchServer Renderer watch server instance.
 * Needs to set up `VITE_DEV_SERVER_URL` environment variable from {@link import('vite').ViteDevServer.resolvedUrls}
 */
function setupMainPackageWatcher({resolvedUrls}) {
  process.env.VITE_DEV_SERVER_URL = resolvedUrls.local[0];

  /** @type {ChildProcess | null} */
  let electronApp = null;

  return build({
    mode,
    logLevel,
    root: path.resolve('packages/main'),
    build: {
      /**
       * Set to {} to enable rollup watcher
       * @see https://vitejs.dev/config/build-options.html#build-watch
       */
      watch: {},
    },
    plugins: [
      {
        name: 'reload-app-on-main-package-change',
        writeBundle() {
          /** Kill electron if a process already exists */
          if (electronApp !== null) {
            electronApp.removeListener('exit', process.exit);
            electronApp.kill('SIGINT');
            electronApp = null;
          }

          /** Spawn a new electron process */
          electronApp = spawn(String(electronPath), ['--inspect', '.'], {
            stdio: 'inherit',
          });

          /** Stops the watch script when the application has been quit */
          electronApp.addListener('exit', process.exit);
        },
      },
    ],
  });
}

/**
 * Setup watcher for `preload` package
 * On file changed it reload web page.
 * @param {import('vite').ViteDevServer} watchServer Renderer watch server instance.
 * Required to access the web socket of the page. By sending the `full-reload` command to the socket, it reloads the web page.
 */
function setupPreloadPackageWatcher({ws}) {
  return build({
    mode,
    logLevel,
    root: path.resolve('packages/preload'),
    build: {
      /**
       * Set to {} to enable rollup watcher
       * @see https://vitejs.dev/config/build-options.html#build-watch
       */
      watch: {},
    },
    plugins: [
      {
        name: 'reload-page-on-preload-package-change',
        writeBundle() {
          ws.send({
            type: 'full-reload',
          });
        },
      },
    ],
  });
}

/**
 * Dev server for Renderer package
 * This must be the first,
 * because the {@link setupMainPackageWatcher} and {@link setupPreloadPackageWatcher}
 * depend on the dev server properties
 */
const rendererWatchServer = await createServer({
  mode,
  logLevel,
  root: path.resolve('packages/renderer'),
}).then(s => s.listen());

await setupPreloadPackageWatcher(rendererWatchServer);
await setupMainPackageWatcher(rendererWatchServer);
