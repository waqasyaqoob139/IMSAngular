import { Pipe, PipeTransform } from '@angular/core';
import { formatAppDate, formatAppDateTime } from '../../core/utils/date-format';

@Pipe({ name: 'appDate', standalone: true })
export class AppDatePipe implements PipeTransform {
  transform(value: unknown, mode: 'date' | 'datetime' = 'date'): string {
    if (mode === 'datetime') {
      return formatAppDateTime(value as string | Date | null | undefined);
    }
    return formatAppDate(value as string | Date | null | undefined);
  }
}
