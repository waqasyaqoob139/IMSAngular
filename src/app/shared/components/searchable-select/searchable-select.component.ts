import {
  booleanAttribute,
  Component,
  ElementRef,
  EventEmitter,
  forwardRef,
  HostBinding,
  HostListener,
  Input,
  OnDestroy,
  Output,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { NavigationStart, Router } from '@angular/router';
import { filter, Subject, takeUntil } from 'rxjs';
import { SEARCHABLE_CREATE_VALUE, SearchableSelectOption, valuesEqual } from './searchable-select.models';

@Component({
  selector: 'app-searchable-select',
  templateUrl: './searchable-select.component.html',
  styleUrl: './searchable-select.component.scss',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SearchableSelectComponent),
      multi: true
    }
  ]
})
export class SearchableSelectComponent implements ControlValueAccessor, OnDestroy {
  @Input() items: SearchableSelectOption[] = [];
  @Input() placeholder = 'Choose...';
  @Input() nullLabel?: string;
  @Input({ transform: booleanAttribute }) nullable = false;
  @Input({ transform: booleanAttribute }) small = false;
  @Input({ transform: booleanAttribute }) invalid = false;
  @Input({ transform: booleanAttribute }) allowCreate = false;
  @Input({ transform: booleanAttribute }) wide = false;
  @Input() pendingText: string | null = null;
  @Input() txnFocus?: string;
  /**
   * When true, do not filter items locally — parent handles search (e.g. API product search).
   * Without this, typing only searches the already-loaded page of items.
   */
  @Input({ transform: booleanAttribute }) serverFilter = false;

  @Output() selectionChange = new EventEmitter<unknown>();
  @Output() pendingTextChange = new EventEmitter<string | null>();
  @Output() openChange = new EventEmitter<boolean>();
  /** Emitted when the panel search text changes (for server-side filtering). */
  @Output() searchChange = new EventEmitter<string>();

  @ViewChild('trigger') triggerRef?: ElementRef<HTMLButtonElement>;
  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('panel') panelRef?: ElementRef<HTMLElement>;

  open = false;
  search = '';
  highlightedIndex = 0;
  value: unknown = null;
  disabled = false;
  panelStyle: Record<string, string> = {};

  @HostBinding('attr.tabindex')
  get hostTabIndex(): number {
    return this.disabled ? -1 : 0;
  }

  @HostBinding('class.searchable-select--open')
  get isOpen(): boolean {
    return this.open;
  }

  @HostBinding('class.searchable-select--wide')
  get isWide(): boolean {
    return this.wide;
  }

  private onChange: (value: unknown) => void = () => {};
  private onTouched: () => void = () => {};
  private readonly destroy$ = new Subject<void>();
  private scrollListener = () => {
    if (this.open) {
      this.portalPanelToBody();
      this.updatePanelPosition();
    }
  };

  constructor(
    private readonly hostRef: ElementRef<HTMLElement>,
    private readonly router: Router
  ) {
    this.router.events.pipe(
      filter((event): event is NavigationStart => event instanceof NavigationStart),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      if (this.open) this.finishClose();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.detachScrollListener();
    this.teardownPanel();
  }

  get displayLabel(): string {
    const pending = this.pendingText?.trim();
    if (pending) return pending;

    if (this.value == null || this.value === '') {
      return this.nullLabel ?? this.placeholder;
    }
    const item = this.items.find(i => valuesEqual(i.value, this.value));
    return item?.label ?? String(this.value);
  }

  get hasPendingSelection(): boolean {
    return !!this.pendingText?.trim();
  }

  get filteredItems(): SearchableSelectOption[] {
    if (this.serverFilter) {
      return this.items;
    }
    const q = this.search.trim().toLowerCase();
    return q ? this.items.filter(i => i.label.toLowerCase().includes(q)) : this.items;
  }

  get visibleItems(): SearchableSelectOption[] {
    const q = this.search.trim();
    const qLower = q.toLowerCase();
    const filtered = this.filteredItems;

    const nullLabel = this.nullLabel ?? this.placeholder;
    const includeNull = this.nullable && (!q || nullLabel.toLowerCase().includes(qLower));

    const items: SearchableSelectOption[] = includeNull
      ? [{ value: null, label: nullLabel }, ...filtered]
      : [...filtered];

    if (this.allowCreate && q && !this.hasExactItemMatch(q) && filtered.length === 0) {
      items.unshift({ value: SEARCHABLE_CREATE_VALUE, label: q });
    }

    return items;
  }

  writeValue(value: unknown): void {
    this.value = value;
  }

  registerOnChange(fn: (value: unknown) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  toggle(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.disabled) return;
    if (this.open) this.close();
    else this.openPanel();
  }

  openPanel(): void {
    if (this.disabled) return;
    this.open = true;
    this.openChange.emit(true);
    this.search = this.pendingText?.trim() ?? '';
    this.highlightedIndex = 0;
    this.searchChange.emit(this.search.trim());
    setTimeout(() => {
      this.portalPanelToBody();
      this.updatePanelPosition();
      this.attachScrollListener();
      this.searchInputRef?.nativeElement.focus();
      this.searchInputRef?.nativeElement.select();
    }, 0);
  }

  close(): void {
    if (!this.open) return;

    const q = this.search.trim();
    if (q) {
      const exact = this.items.find(i => i.label.toLowerCase() === q.toLowerCase());
      if (exact) {
        this.selectExisting(exact);
        this.finishClose();
        return;
      }

      if (this.allowCreate && this.filteredItems.length === 0) {
        this.applyPendingCreate(q);
      }
    }

    this.finishClose();
  }

  selectItem(item: SearchableSelectOption, event?: MouseEvent): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (item.disabled) return;

    if (item.value === SEARCHABLE_CREATE_VALUE) {
      this.applyPendingCreate(this.search.trim() || item.label);
      this.finishClose();
      return;
    }

    this.selectExisting(item);
    this.finishClose();
  }

  isSelected(item: SearchableSelectOption): boolean {
    if (item.value === SEARCHABLE_CREATE_VALUE) {
      return this.hasPendingSelection;
    }
    return valuesEqual(item.value, this.value) && !this.hasPendingSelection;
  }

  isCreateOption(item: SearchableSelectOption): boolean {
    return item.value === SEARCHABLE_CREATE_VALUE;
  }

  onSearchChange(): void {
    this.highlightedIndex = 0;
    this.searchChange.emit(this.search.trim());
    if (this.open) {
      this.portalPanelToBody();
      this.updatePanelPosition();
    }
  }

  onTriggerKeydown(event: KeyboardEvent): void {
    if (this.disabled || this.open) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === ' ') {
      event.preventDefault();
      this.openPanel();
    }
  }

  onPanelKeydown(event: KeyboardEvent): void {
    const items = this.visibleItems;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!items.length) return;
      this.highlightedIndex = Math.min(this.highlightedIndex + 1, items.length - 1);
      this.scrollActiveOptionIntoView();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!items.length) return;
      this.highlightedIndex = Math.max(this.highlightedIndex - 1, 0);
      this.scrollActiveOptionIntoView();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const q = this.search.trim();
      if (items.length) {
        const item = items[this.highlightedIndex];
        if (item) this.selectItem(item);
        return;
      }
      if (this.allowCreate && q && this.filteredItems.length === 0) {
        this.applyPendingCreate(q);
        this.finishClose();
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.finishClose();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.open) return;
    const target = event.target as Node;
    if (this.hostRef.nativeElement.contains(target)) return;
    if (this.panelRef?.nativeElement.contains(target)) return;
    this.close();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.open) this.updatePanelPosition();
  }

  @HostListener('focus')
  onHostFocus(): void {
    if (this.disabled) return;
    this.triggerRef?.nativeElement.focus();
  }

  private selectExisting(item: SearchableSelectOption): void {
    if (this.pendingText?.trim()) {
      this.pendingTextChange.emit(null);
    }
    this.value = item.value;
    this.onChange(this.value);
    this.selectionChange.emit(this.value);
  }

  private applyPendingCreate(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;

    this.value = null;
    this.pendingTextChange.emit(trimmed);
    this.onChange(null);
    this.selectionChange.emit(null);
  }

  private hasExactItemMatch(query: string): boolean {
    const q = query.trim().toLowerCase();
    return !!q && this.items.some(i => i.label.toLowerCase() === q);
  }

  private finishClose(): void {
    const wasOpen = this.open;
    this.open = false;
    this.search = '';
    this.panelStyle = {};
    this.detachScrollListener();
    this.restorePanelToHost();
    this.onTouched();
    if (wasOpen) this.openChange.emit(false);
    setTimeout(() => this.triggerRef?.nativeElement.focus(), 0);
  }

  private attachScrollListener(): void {
    document.addEventListener('scroll', this.scrollListener, true);
  }

  private detachScrollListener(): void {
    document.removeEventListener('scroll', this.scrollListener, true);
  }

  private updatePanelPosition(): void {
    const trigger = this.triggerRef?.nativeElement;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const gap = 2;
    const panelWidth = this.getPanelWidth(rect);
    const estimatedHeight = Math.min(this.visibleItems.length * 32 + 48, 268);
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openAbove = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

    let maxHeight = openAbove
      ? rect.top - viewportPadding - gap
      : window.innerHeight - rect.bottom - viewportPadding - gap;

    if (openAbove) {
      this.panelStyle = {
        top: 'auto',
        bottom: `${window.innerHeight - rect.top + gap}px`,
        left: `${rect.left}px`,
        width: `${panelWidth}px`,
        maxHeight: `${Math.max(120, maxHeight)}px`
      };
      return;
    }

    const top = rect.bottom + gap;
    if (top + estimatedHeight > window.innerHeight - viewportPadding) {
      maxHeight = Math.max(120, window.innerHeight - viewportPadding - top);
    }

    this.panelStyle = {
      top: `${top}px`,
      left: `${rect.left}px`,
      width: `${panelWidth}px`,
      maxHeight: `${Math.max(120, maxHeight)}px`
    };
  }

  private getPanelWidth(rect: DOMRect): number {
    const minWidth = this.wide ? 280 : 180;
    const maxWidth = this.wide
      ? Math.min(520, window.innerWidth - 16)
      : Math.min(352, window.innerWidth - 16);
    return Math.min(Math.max(rect.width, minWidth), maxWidth);
  }

  private scrollActiveOptionIntoView(): void {
    setTimeout(() => {
      const panel = this.panelRef?.nativeElement;
      const active = panel?.querySelector('.searchable-select__option--active');
      active?.scrollIntoView({ block: 'nearest' });
    }, 0);
  }

  private portalPanelToBody(): void {
    const panel = this.panelRef?.nativeElement;
    if (panel && panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }
  }

  private restorePanelToHost(): void {
    const panel = this.panelRef?.nativeElement;
    const host = this.hostRef.nativeElement;
    if (panel && panel.parentElement === document.body) {
      host.appendChild(panel);
    }
  }

  private teardownPanel(): void {
    this.open = false;
    const panel = this.panelRef?.nativeElement;
    if (!panel) return;

    if (panel.parentElement === document.body) {
      panel.remove();
      return;
    }

    this.restorePanelToHost();
  }
}
