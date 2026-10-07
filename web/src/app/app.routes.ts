import { Routes } from '@angular/router';

/**
 * Two routes. Both are lazily loaded: the detail view pulls in the chart component, which the
 * overview does not need, and a wall display that only ever shows the overview should not pay
 * for it.
 */
export const routes: Routes = [
  {
    path: '',
    title: 'Plant overview — PlantWatch',
    loadComponent: () => import('./features/overview/overview').then((m) => m.Overview),
  },
  {
    path: 'machines/:code',
    title: 'Machine — PlantWatch',
    loadComponent: () =>
      import('./features/machine-detail/machine-detail').then((m) => m.MachineDetail),
  },
  { path: '**', redirectTo: '' },
];
