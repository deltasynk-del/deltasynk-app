import { Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'dp-pager',
  standalone: true,
  template: `
    @if (total() > pageSize()) {
      <div class="mt-3 flex items-center justify-between gap-3 text-sm text-slate-600">
        <span>{{ from() }}–{{ to() }} of {{ total() }}</span>
        <div class="flex gap-2">
          <button type="button" class="btn-secondary btn-sm" [disabled]="page() <= 1" (click)="pageChange.emit(page() - 1)">
            Previous
          </button>
          <button type="button" class="btn-secondary btn-sm" [disabled]="to() >= total()" (click)="pageChange.emit(page() + 1)">
            Next
          </button>
        </div>
      </div>
    }
  `,
})
export class PagerComponent {
  readonly total = input.required<number>();
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly pageChange = output<number>();

  readonly from = computed(() => (this.page() - 1) * this.pageSize() + 1);
  readonly to = computed(() => Math.min(this.page() * this.pageSize(), this.total()));
}
