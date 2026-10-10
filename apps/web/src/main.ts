import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { showStartupError } from './app/core/startup-error';

bootstrapApplication(App, appConfig).catch((err: unknown) => {
  console.error('[board-table] startup failed', err);
  showStartupError(document, () => location.reload());
});
