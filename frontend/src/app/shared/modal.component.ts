import { Component, HostListener, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Centered dialog. Closes on Escape, the ✕ button, or a click on the backdrop. */
@Component({
  selector: 'dp-modal',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="fixed inset-0 z-[1200] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" (click)="closed.emit()">
      <div
        class="flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        [class.sm:max-w-md]="!wide()"
        [class.sm:max-w-2xl]="wide()"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="title()"
        (click)="$event.stopPropagation()"
      >
        <header class="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <h2 class="text-base font-bold text-slate-900">{{ title() }}</h2>
          <button type="button" class="-m-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close" (click)="closed.emit()">
            <mat-icon>close</mat-icon>
          </button>
        </header>
        <div class="overflow-y-auto px-5 py-4">
          <ng-content />
        </div>
      </div>
    </div>
  `,
})
export class ModalComponent {
  readonly title = input.required<string>();
  readonly wide = input(false);
  readonly closed = output<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }
}
