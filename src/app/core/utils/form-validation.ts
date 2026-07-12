import { AbstractControl, FormArray, FormGroup } from '@angular/forms';

const FIELD_LABELS: Record<string, string> = {
  saleId: 'Sale invoice',
  purchaseId: 'Purchase invoice',
  customerId: 'Customer',
  supplierId: 'Supplier',
  returnDate: 'Return date',
  expenseDate: 'Expense date',
  paymentDate: 'Payment date',
  amount: 'Amount',
  expenseCategoryId: 'Category',
  paymentMethodId: 'Payment method',
  refundMethodId: 'Refund method',
  locationId: 'Location',
  returnQuantity: 'Return quantity',
  quantity: 'Quantity',
  taxAmount: 'Tax',
  unitPrice: 'Unit price',
  description: 'Description',
  referenceNumber: 'Reference number',
  reason: 'Reason',
  username: 'Username',
  password: 'Password',
  customerName: 'Customer name',
  supplierName: 'Supplier name',
  productName: 'Product name',
  categoryName: 'Category name',
  brandName: 'Brand name',
  unitName: 'Unit name',
  locationName: 'Location name',
  sku: 'SKU',
  adjustmentDate: 'Adjustment date',
  transferDate: 'Transfer date',
  fromLocationId: 'From location',
  toLocationId: 'To location',
  productId: 'Product',
  quantityChange: 'Quantity change'
};

export interface FormValidationOptions {
  linesArrayName?: string;
  quantityFieldName?: string;
  productFieldName?: string;
}

/** User-visible message when a reactive form blocks save. */
export function getFormValidationMessage(
  form: FormGroup,
  options: FormValidationOptions = {}
): string {
  const {
    linesArrayName = 'lines',
    quantityFieldName = 'returnQuantity',
    productFieldName = 'productName'
  } = options;

  const lines = form.get(linesArrayName);
  if (lines instanceof FormArray) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines.at(i);
      const qtyControl = line.get(quantityFieldName);
      if (!qtyControl?.invalid) continue;

      const product = line.get(productFieldName)?.value;
      const lineLabel = product ? `"${product}"` : `line ${i + 1}`;

      if (qtyControl.hasError('max')) {
        const max = qtyControl.getError('max')?.max;
        return max != null
          ? `Return quantity for ${lineLabel} cannot exceed ${max}.`
          : `Return quantity for ${lineLabel} exceeds available quantity.`;
      }
      if (qtyControl.hasError('min')) {
        const min = qtyControl.getError('min')?.min;
        return min != null
          ? `Return quantity for ${lineLabel} must be at least ${min}.`
          : `Return quantity for ${lineLabel} is too low.`;
      }
      if (qtyControl.hasError('required')) {
        return `Enter return quantity for ${lineLabel}.`;
      }
    }
  }

  for (const [key, control] of Object.entries(form.controls)) {
    if (key === linesArrayName) continue;
    const message = controlMessage(key, control);
    if (message) return message;
  }

  return 'Please fix the highlighted fields before saving.';
}

function controlMessage(key: string, control: AbstractControl): string | null {
  if (!control.invalid || !control.errors) return null;

  const label = FIELD_LABELS[key] ?? key;

  if (control.errors['required']) return `${label} is required.`;
  if (control.errors['min']) {
    const min = control.errors['min'].min;
    return `${label} must be at least ${min}.`;
  }
  if (control.errors['max']) {
    const max = control.errors['max'].max;
    return `${label} cannot exceed ${max}.`;
  }

  return `${label} is invalid.`;
}

/** Mark form touched and return a validation message if invalid. */
export function blockSaveIfInvalid(
  form: FormGroup,
  options: FormValidationOptions = {}
): string | null {
  if (!form.invalid) return null;
  form.markAllAsTouched();
  return getFormValidationMessage(form, options);
}
