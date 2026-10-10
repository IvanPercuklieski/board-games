import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Game catalog (search + host). Filled in by the next step. */
@Component({
  selector: 'bt-catalog-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<main id="main"><h1>Games</h1></main>`,
})
export class CatalogPage {}
