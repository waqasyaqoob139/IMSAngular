import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { focusTxnElement } from '../../../core/utils/txn-keyboard';
import {
  filterProductsBySearchMode,
  productBrowsePlaceholder,
  ProductSearchMode
} from '../../../core/utils/product-search';

export interface TxnBrowseProduct {
  productId: number;
  productName: string;
  sku: string;
  serialNo?: string | null;
  stock: number;
  price: number;
}

@Component({
  selector: 'app-txn-product-browse',
  templateUrl: './txn-product-browse.component.html',
  standalone: false
})
export class TxnProductBrowseComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Input() products: TxnBrowseProduct[] = [];
  @Input() priceLabel = 'Price';
  @Input() searchMode: ProductSearchMode = 'Both';

  @Output() closed = new EventEmitter<void>();
  @Output() selected = new EventEmitter<TxnBrowseProduct>();

  @ViewChild('browseSearchInput') browseSearchInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('browseOverlay') browseOverlayRef?: ElementRef<HTMLElement>;

  filter = '';
  highlightedIndex = 0;

  constructor(private readonly hostRef: ElementRef<HTMLElement>) {}

  get filteredProducts(): TxnBrowseProduct[] {
    return filterProductsBySearchMode(this.products, this.filter, this.searchMode);
  }

  get searchPlaceholder(): string {
    return productBrowsePlaceholder(this.searchMode);
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
    if (openChange?.currentValue === false && openChange.previousValue === true) {
      this.restoreOverlayToHost();
    }
  }

  ngOnDestroy(): void {
    this.teardownOverlay();
  }

  private portalOverlayToBody(): void {
    const overlay = this.browseOverlayRef?.nativeElement;
    if (overlay && overlay.parentElement !== document.body) {
      document.body.appendChild(overlay);
    }
  }

  private restoreOverlayToHost(): void {
    const overlay = this.browseOverlayRef?.nativeElement;
    const host = this.hostRef.nativeElement;
    if (overlay && overlay.parentElement === document.body) {
      host.appendChild(overlay);
    }
  }

  private teardownOverlay(): void {
    const overlay = this.browseOverlayRef?.nativeElement;
    if (!overlay) return;

    if (overlay.parentElement === document.body) {
      overlay.remove();
      return;
    }

    this.restoreOverlayToHost();
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
