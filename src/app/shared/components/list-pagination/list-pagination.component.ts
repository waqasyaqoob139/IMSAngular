import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ListPagination } from '../../../core/utils/list-pagination';

@Component({
  selector: 'app-list-pagination',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './list-pagination.component.html',
  styleUrl: './list-pagination.component.scss'
})
export class ListPaginationComponent {
  @Input({ required: true }) pagination!: ListPagination;
  @Input() loading = false;
  @Output() pageChange = new EventEmitter<number>();
  @Output() pageSizeChange = new EventEmitter<number>();

  readonly pageSizeOptions = ListPagination.pageSizeOptions;

  goToPage(page: number): void {
    if (this.loading || page < 1 || page > this.pagination.totalPages || page === this.pagination.pageNumber) {
      return;
    }
    this.pageChange.emit(page);
  }

  onPageSizeChange(size: number): void {
    if (this.loading || size === this.pagination.pageSize) return;
    this.pageSizeChange.emit(size);
  }
}
