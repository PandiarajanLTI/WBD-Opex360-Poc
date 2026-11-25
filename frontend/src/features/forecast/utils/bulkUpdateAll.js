// "Bulk update all": one PATCH changes one field on every row of the template on the server.
// These helpers hold the rules/wording so they can be unit-tested without rendering the page.

export const BULK_UPDATE_ALL_FIELDS = new Set(['NOV_FORECAST', 'DEC_FORECAST', 'NOTES']);

// Returns a message to show in the notice banner, or null when the request is valid.
export function validateBulkUpdateAll(field, value) {
  if (!BULK_UPDATE_ALL_FIELDS.has(field)) {
    return 'Choose November Forecast, December Forecast or Notes.';
  }
  if (field === 'NOTES') {
    return typeof value === 'string' ? null : 'Enter the notes text.';
  }
  return typeof value === 'number' && Number.isFinite(value) ? null : 'Enter a valid number.';
}

// Bulk update all always changes every record of the template, not only the filtered rows
// that are listed, so the user is asked first when a filter is active.
export function bulkUpdateAllFilterWarning(shownCount) {
  return `A filter is active, but Bulk update all changes every record in this template, not only the ${shownCount.toLocaleString()} shown. Continue?`;
}

// Text for the green notice banner. `result` is the PATCH response:
// { updated, skipped, skippedReasons, skippedIds }. A bare number is still accepted.
// Rows without a usable CURRENCY / PRATE FX rate are skipped by the server; they are listed here
// so they can be fixed, instead of the whole update failing.
export function bulkUpdateAllMessage(result) {
  const response = typeof result === 'object' && result !== null ? result : { updated: result };
  const { updated } = response;
  const skipped = Number(response.skipped) > 0 ? Number(response.skipped) : 0;
  const skippedNote = skipped
    ? ` ${skipped.toLocaleString()} record(s) were skipped because they cannot get a PRATE value` +
      `${response.skippedReasons?.length ? ` (${response.skippedReasons.join('; ')})` : ''}.` +
      `${response.skippedIds?.length ? ` UNIQ_ID: ${response.skippedIds.join(', ')}${skipped > response.skippedIds.length ? ', …' : ''}.` : ''}`
    : '';
  if (updated === 0) {
    return `Bulk update finished, but no records matched. Nothing was changed.${skippedNote}`;
  }
  const who = Number.isFinite(updated) ? `${updated.toLocaleString()} records were` : 'All records were';
  return `Bulk update completed. ${who} updated in a single request.${skippedNote}`;
}
