import { presetRegistry } from '../../config/presets';

export function PresetControl({ onApply }: { onApply: (id: string) => void }) {
  return (
    <label className="preset-control">
      <span>プリセット</span>
      <select defaultValue="" onChange={(event) => { if (event.target.value) onApply(event.target.value); }}>
        <option value="" disabled>選択してください</option>
        {presetRegistry.map((preset) => <option key={preset.id} value={preset.id}>{preset.title}</option>)}
      </select>
    </label>
  );
}

