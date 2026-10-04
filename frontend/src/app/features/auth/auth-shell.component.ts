import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export interface AuthShellFeature {
  icon: string;
  text: string;
}

@Component({
  selector: 'dp-auth-shell',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './auth-shell.component.html',
  styleUrl: './auth-shell.component.scss',
})
export class AuthShellComponent {
  readonly headline = input('Run every DeltaSynk product from one place');
  readonly lead = input(
    'Approve sender IDs and verify subscription and SMS top-up payments coming from QualitySchool, SynkMart and the website.',
  );
  readonly features = input<AuthShellFeature[]>([
    { icon: 'shield', text: 'Role-based access with two-step verification' },
    { icon: 'fact_check', text: 'Every approval recorded in the activity log' },
  ]);

  readonly currentYear = new Date().getFullYear();
}
