import { describe, it, expect } from 'vitest';
import { prepareItems } from '../ContentCalendarImportModal';

describe('prepareItems (Excel serials are not reused)', () => {
  const clients = [{ id: 'ws-zem', name: 'ZEM Builders' }];

  it('does not collapse distinct Excel serials into the same guessed serial', () => {
    const prepared = prepareItems(
      [
        {
          sheetRef: 'ZEM-NOV26-01',
          detectedClient: 'ZEM Builders',
          item: {
            serial: 'ZEM-NOV26-01',
            client_name: 'ZEM Builders',
            content_concept: 'One',
          },
        },
        {
          sheetRef: 'ZEM-NOV26-02',
          detectedClient: 'ZEM Builders',
          item: {
            serial: 'ZEM-NOV26-24',
            client_name: 'ZEM Builders',
            content_concept: 'Twenty four',
          },
        },
      ],
      'ZEM Builders',
      true,
      clients,
    );

    expect(prepared).toHaveLength(2);
    expect(prepared[0].serial).toBeUndefined();
    expect(prepared[1].serial).toBeUndefined();
    expect(prepared.map((row) => row.serial)).not.toEqual(['CZB-026', 'CZB-026']);
    expect(prepared[0].content_concept).toBe('One');
    expect(prepared[1].content_concept).toBe('Twenty four');
  });
});
