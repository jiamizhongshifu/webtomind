import { Container } from '@cloudflare/containers';
import { env } from 'cloudflare:workers';

export class WatermarksRemoverContainer extends Container {
  defaultPort = 8765;
  sleepAfter = '10m';
  enableInternet = false;
  pingEndpoint = 'localhost/health';
  envVars = {
    WATERMARKS_SERVER_API_KEY: env.WATERMARKS_SERVICE_API_KEY || ''
  };

  override onStart() {
    console.log('[watermarks] container started');
  }

  override onError(error: unknown) {
    console.error('[watermarks] container failed to start', error);
    throw error;
  }
}
