import { Routes } from '@angular/router';
import { Permission } from './core/config/permissions';
import { authGuard, permissionGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/app-shell.component').then((m) => m.AppShellComponent),
    children: [
      {
        path: 'dashboard',
        canActivate: [permissionGuard],
        data: { permission: Permission.DASHBOARD_VIEW },
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
        title: 'Dashboard — DeltaSynk Portal',
      },
      {
        path: 'sender-ids',
        canActivate: [permissionGuard],
        data: { permission: Permission.SENDER_IDS_VIEW },
        loadComponent: () =>
          import('./features/sender-ids/sender-ids.component').then((m) => m.SenderIdsComponent),
        title: 'Sender IDs — DeltaSynk Portal',
      },
      {
        path: 'subscriptions',
        canActivate: [permissionGuard],
        data: {
          permission: Permission.SUBSCRIPTIONS_VIEW,
          verifyPermission: Permission.SUBSCRIPTIONS_VERIFY,
          route: 'subscriptions',
        },
        loadComponent: () =>
          import('./features/payments/payments.component').then((m) => m.PaymentsComponent),
        title: 'Subscriptions — DeltaSynk Portal',
      },
      {
        path: 'top-ups',
        canActivate: [permissionGuard],
        data: {
          permission: Permission.TOPUPS_VIEW,
          verifyPermission: Permission.TOPUPS_VERIFY,
          route: 'top-ups',
        },
        loadComponent: () =>
          import('./features/payments/payments.component').then((m) => m.PaymentsComponent),
        title: 'SMS top-ups — DeltaSynk Portal',
      },
      {
        path: 'warranty-cards',
        canActivate: [permissionGuard],
        data: { permission: Permission.WARRANTY_CARDS_VIEW },
        loadComponent: () =>
          import('./features/warranty-cards/warranty-cards.component').then((m) => m.WarrantyCardsComponent),
        title: 'Warranty cards — DeltaSynk Portal',
      },
      {
        path: 'product-labels',
        canActivate: [permissionGuard],
        data: { permission: Permission.PRODUCT_LABELS_VIEW },
        loadComponent: () =>
          import('./features/product-labels/product-labels.component').then((m) => m.ProductLabelsComponent),
        title: 'Product labels — DeltaSynk Portal',
      },
      {
        path: 'website-plans',
        canActivate: [permissionGuard],
        data: { permission: Permission.WEBSITE_VIEW },
        loadComponent: () =>
          import('./features/website/website-plans.component').then((m) => m.WebsitePlansComponent),
        title: 'Plans & equipment — DeltaSynk Portal',
      },
      {
        path: 'hardware',
        canActivate: [permissionGuard],
        data: { permission: Permission.HARDWARE_VIEW },
        loadComponent: () =>
          import('./features/website/hardware.component').then((m) => m.HardwareComponent),
        title: 'Hardware requests — DeltaSynk Portal',
      },
      {
        path: 'users',
        canActivate: [permissionGuard],
        data: { permission: Permission.USERS_VIEW },
        loadComponent: () =>
          import('./features/users/users.component').then((m) => m.UsersComponent),
        title: 'Users & roles — DeltaSynk Portal',
      },
      {
        path: 'apps',
        canActivate: [permissionGuard],
        data: { permission: Permission.APPS_VIEW },
        loadComponent: () =>
          import('./features/apps/apps.component').then((m) => m.AppsComponent),
        title: 'Connected apps — DeltaSynk Portal',
      },
      {
        path: 'audit',
        canActivate: [permissionGuard],
        data: { permission: Permission.AUDIT_VIEW },
        loadComponent: () =>
          import('./features/audit/audit.component').then((m) => m.AuditComponent),
        title: 'Activity log — DeltaSynk Portal',
      },
      {
        path: 'account',
        loadComponent: () =>
          import('./features/account/account.component').then((m) => m.AccountComponent),
        title: 'My account — DeltaSynk Portal',
      },
    ],
  },
  {
    // Outside the portal layout so only the cards reach the printer.
    path: 'print/warranty-cards',
    canActivate: [authGuard, permissionGuard],
    data: { permission: Permission.WARRANTY_CARDS_VIEW },
    loadComponent: () =>
      import('./features/warranty-cards/warranty-print.component').then((m) => m.WarrantyPrintComponent),
    title: 'Print warranty cards — DeltaSynk Portal',
  },
  {
    // Outside the portal layout so only the labels reach the printer.
    path: 'print/product-labels/:id',
    canActivate: [authGuard, permissionGuard],
    data: { permission: Permission.PRODUCT_LABELS_VIEW },
    loadComponent: () =>
      import('./features/product-labels/product-labels-print.component').then((m) => m.ProductLabelsPrintComponent),
    title: 'Print product labels — DeltaSynk Portal',
  },
  { path: '**', redirectTo: '' },
];
