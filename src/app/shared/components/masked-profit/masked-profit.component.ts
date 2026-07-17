import { AsyncPipe, DecimalPipe, NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';
import { ProfitVisibilityService } from '../../../core/services/profit-visibility.service';

/**
 * Shows a profit amount as *** by default, with an eye toggle to reveal.
 * Visibility is shared app-wide via ProfitVisibilityService.
 */
@Component({
  selector: 'app-masked-profit',
  standalone: true,
  imports: [NgIf, AsyncPipe, DecimalPipe],
  templateUrl: './masked-profit.component.html',
  styleUrl: './masked-profit.component.scss'
})
export class MaskedProfitComponent {
  /** When set, renders the amount (or ***). Omit for toggle-only (e.g. column header). */
  @Input() value: number | string | null | undefined;
  @Input() digits = '1.2-2';
  /** Show the eye button. Use false in table cells when the header already has a toggle. */
  @Input() showToggle = true;
  @Input() mask = '***';

  constructor(readonly profitVisibility: ProfitVisibilityService) {}

  get hasValue(): boolean {
    return this.value !== null && this.value !== undefined && this.value !== '';
  }

  get numericValue(): number {
    return Number(this.value) || 0;
  }

  toggle(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.profitVisibility.toggle();
  }
}
