import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { readCardFromCharx } from '../src/io/charx';
import { writeCardToPng } from '../src/io/png';
import { CharacterCardV3 } from '../src/schemas/cardSchema';

describe('charx io', () => {
  const dummyCard: CharacterCardV3 = {
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data: {
      name: 'Test',
      description: 'Test',
      personality: '',
      scenario: '',
      first_mes: '',
      mes_example: '',
      creator_notes: '',
      system_prompt: '',
      post_history_instructions: '',
      tags: [],
      creator: '',
      character_version: '',
      alternate_greetings: [],
      group_only_greetings: [],
      extensions: {},
      entries: []
    }
  };

  it('rejects zip entry count cap exceeded', async () => {
    const zip = new JSZip();
    for (let i = 0; i < 505; i++) {
      zip.file(`file${i}.txt`, 'hello');
    }
    const buffer = await zip.generateAsync({ type: 'uint8array' });
    await expect(readCardFromCharx(buffer)).rejects.toThrow(/max entry count/);
  });

  it('rejects path traversal', async () => {
    const zip = new JSZip();
    zip.file('/evil.txt', 'hello');
    zip.file('card.json', JSON.stringify(dummyCard));
    const buffer = await zip.generateAsync({ type: 'uint8array' });
    await expect(readCardFromCharx(buffer)).rejects.toThrow(/Path traversal/);
  });

  it('rejects zip bomb / compression ratio', async () => {
    const zip = new JSZip();
    zip.file('card.json', JSON.stringify(dummyCard));
    const payload = new Uint8Array(2 * 1024 * 1024);
    zip.file('big.txt', payload);
    const buffer = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    await expect(readCardFromCharx(buffer)).rejects.toThrow(/Suspicious compression ratio/);
  });

  it('rejects a multi-card JSON zip so bulk import can unpack all cards', async () => {
    const zip = new JSZip();
    zip.file('Alice.json', JSON.stringify({ ...dummyCard, data: { ...dummyCard.data, name: 'Alice' } }));
    zip.file('Bob.json', JSON.stringify({ ...dummyCard, data: { ...dummyCard.data, name: 'Bob' } }));
    const buffer = await zip.generateAsync({ type: 'uint8array' });
    await expect(readCardFromCharx(buffer)).rejects.toThrow(/multiple character cards/);
  });

  it('rejects a PNG-only zip with no CHARX card JSON', async () => {
    const zip = new JSZip();
    zip.file('Alice.png', writeCardToPng(dummyCard));
    const buffer = await zip.generateAsync({ type: 'uint8array' });
    await expect(readCardFromCharx(buffer)).rejects.toThrow(/No character card JSON/);
  });
});
