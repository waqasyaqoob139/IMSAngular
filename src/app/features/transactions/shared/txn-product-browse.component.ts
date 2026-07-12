import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { focusTxnElement } from '../../../core/utils/txn-keyboard';

export interface TxnBrowseProduct {
  productId: number;
  productName: string;
  sku: string;
  stock: number;
  price: number;
}

@Component({
  selector: 'app-txn-product-browse',
  templateUrl: './txn-product-browse.component.html',
  standalone: false
})
export class TxnProductBrowseComponent implements OnChanges {
  @Input() open = false;
  @Input() products: TxnBrowseProduct[] = [];
  @Input() priceLabel = 'Price';

  @Output() closed = new EventEmitter<void>();
  @Output() selected = new EventEmitter<TxnBrowseProduct>();

  @ViewChild('browseSearchInput') browseSearchInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('browseOverlay') browseOverlayRef?: ElementRef<HTMLElement>;

  filter = '';
  highlightedIndex = 0;

  get filteredProducts(): TxnBrowseProduct[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) return this.products;
    return this.products.filter(
      p => p.productName.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    const openChange = changes['open'];
    if (openChange?.currentValue === true && openChange.previousValue !== true) {
      this.filter = '';
      this.highlightedIndex = 0;
      setTimeout(() => {
        this.portalOverlayToBody();
        focusTxnElement(this.browseSearchInputRef?.nativeElement);
      }, 0);
    }
  }

  private portalOverlayToBody(): void {
    const overlay = this.browseOverlayRef?.nativeElement;
    if (overlay && overlay.parentElement !== document.body) {
      document.body.appendChild(overlay);
    }
  }

  close(): void {
    this.closed.emit();
  }

  onPanelKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  }

  pick(product: TxnBrowseProduct): void {
    this.selected.emit(product);
  }

  onFilterInput(): void {
    this.highlightedIndex = this.filteredProducts.length > 0 ? 0 : -1;
  }

  onKeydown(event: KeyboardEvent): void {
    const list = this.filteredProducts;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!list.length) return;
      this.highlightedIndex =
        this.highlightedIndex < 0 ? 0 : Math.min(this.highlightedIndex + 1, list.length - 1);
      this.scrollHighlightedIntoView();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!list.length) return;
      this.highlightedIndex = Math.max(this.highlightedIndex - 1, 0);
      this.scrollHighlightedIntoView();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const pick = list[this.highlightedIndex >= 0 ? this.highlightedIndex : 0];
      if (pick) this.pick(pick);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  private scrollHighlightedIntoView(): void {
    setTimeout(() => {
      const el = document.querySelector('.product-browse__row--active');
      el?.scrollIntoView({ block: 'nearest' });
    }, 0);
  }
}
