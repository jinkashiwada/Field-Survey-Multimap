import { describe, expect, it } from 'vitest';
import { presetRegistry } from './presets';

describe('preset registry', () => {
  it('defines the five required presets', () => {
    expect(presetRegistry.map((preset) => preset.title)).toEqual([
      '現地概況', '地形と浸水', '標高と浸水', '微地形確認', '痕跡調査総覧',
    ]);
    expect(presetRegistry.find((preset) => preset.id === 'survey-overview')?.panes).toHaveLength(4);
  });
});

