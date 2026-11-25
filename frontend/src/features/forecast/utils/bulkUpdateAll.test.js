import { describe, expect, it } from 'vitest';
import {
  bulkUpdateAllFilterWarning,
  bulkUpdateAllMessage,
  validateBulkUpdateAll,
} from './bulkUpdateAll';

describe('validateBulkUpdateAll', () => {
  it('accepts a number for NOV/DEC and text for Notes', () => {
    expect(validateBulkUpdateAll('NOV_FORECAST', 125)).toBeNull();
    expect(validateBulkUpdateAll('DEC_FORECAST', 0)).toBeNull();
    expect(validateBulkUpdateAll('DEC_FORECAST', -4.5)).toBeNull();
    expect(validateBulkUpdateAll('NOTES', 'Reviewed')).toBeNull();
    expect(validateBulkUpdateAll('NOTES', '')).toBeNull();
  });

  it('rejects other fields, non-numbers and non-text', () => {
    expect(validateBulkUpdateAll('UPDATED_TS', 1)).toContain('Choose');
    expect(validateBulkUpdateAll('JAN_FORECAST', 1)).toContain('Choose');
    expect(validateBulkUpdateAll('NOV_FORECAST', Number.NaN)).toBe('Enter a valid number.');
    expect(validateBulkUpdateAll('NOV_FORECAST', Infinity)).toBe('Enter a valid number.');
    expect(validateBulkUpdateAll('DEC_FORECAST', '12')).toBe('Enter a valid number.');
    expect(validateBulkUpdateAll('DEC_FORECAST', null)).toBe('Enter a valid number.');
    expect(validateBulkUpdateAll('NOTES', 5)).toBe('Enter the notes text.');
  });
});

describe('bulkUpdateAllMessage', () => {
  it('reports the updated records when nothing was skipped', () => {
    const base = `Bulk update completed. ${(100222).toLocaleString()} records were updated in a single request.`;
    expect(bulkUpdateAllMessage({ updated: 100222, skipped: 0, skippedReasons: [], skippedIds: [] })).toBe(base);
    expect(bulkUpdateAllMessage({ updated: 100222 })).toBe(base);
    expect(bulkUpdateAllMessage(100222)).toBe(base);
  });

  it('says what was skipped and which UNIQ_ID to fix, instead of failing', () => {
    expect(
      bulkUpdateAllMessage({
        updated: 100221,
        skipped: 1,
        skippedReasons: ['1 row(s) have no CURRENCY'],
        skippedIds: [555],
      }),
    ).toBe(
      `Bulk update completed. ${(100221).toLocaleString()} records were updated in a single request.` +
        ' 1 record(s) were skipped because they cannot get a PRATE value (1 row(s) have no CURRENCY). UNIQ_ID: 555.',
    );
  });

  it('shows an ellipsis when more rows were skipped than ids are listed', () => {
    const text = bulkUpdateAllMessage({
      updated: 10,
      skipped: 8,
      skippedReasons: ['3 row(s) have no CURRENCY', '5 row(s) use currency GBP, which has no PRATE FX rate'],
      skippedIds: [1, 2, 3, 4, 5],
    });
    expect(text).toContain('8 record(s) were skipped');
    expect(text).toContain('3 row(s) have no CURRENCY; 5 row(s) use currency GBP');
    expect(text).toContain('UNIQ_ID: 1, 2, 3, 4, 5, ….');
  });

  it('handles an unknown count and an empty template', () => {
    expect(bulkUpdateAllMessage({ updated: null })).toBe(
      'Bulk update completed. All records were updated in a single request.',
    );
    expect(bulkUpdateAllMessage(undefined)).toContain('All records were updated');
    expect(bulkUpdateAllMessage({ updated: 0, skipped: 0 })).toBe(
      'Bulk update finished, but no records matched. Nothing was changed.',
    );
  });

  it('warns that a filter does not limit the update', () => {
    expect(bulkUpdateAllFilterWarning(2211)).toBe(
      `A filter is active, but Bulk update all changes every record in this template, not only the ${(2211).toLocaleString()} shown. Continue?`,
    );
  });
});
