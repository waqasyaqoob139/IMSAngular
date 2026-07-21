import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostBinding, Input, Output } from '@angular/core';
import { Params, RouterLink } from '@angular/router';

export type ActionIcon = 'view' | 'edit' | 'delete' | 'print' | 'remove';
export type ActionIconVariant = 'primary' | 'danger' | 'secondary' | 'success';

@Component({
  selector: 'app-action-icon-button',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './action-icon-button.component.html',
  styleUrl: './action-icon-button.component.scss'
})
export class ActionIconButtonComponent {
  @Input({ required: true }) icon!: ActionIcon;
  @Input({ required: true }) label!: string;
  @Input() variant: ActionIconVariant = 'primary';
  @Input() disabled = false;
  @Input() tabIndex?: number;
  @Input() routerLink?: string | any[];
  @Input() queryParams?: Params;

  @Output() activated = new EventEmitter<void>();

  @HostBinding('style.display') readonly display = 'inline-flex';

  get buttonClass(): string {
    return `action-icon-button action-icon-button--${this.variant}`;
  }

  get isLink(): boolean {
    return this.routerLink !== undefined;
  }

  activate(): void {
    if (!this.disabled) this.activated.emit();
  }
}
