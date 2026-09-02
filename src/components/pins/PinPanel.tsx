import { useState, type FormEvent } from 'react';
import type { PinRecord, PinType } from '../../domain/pins';
import { pinTypeLabels } from '../../domain/pins';

interface PinPanelProps {
  open: boolean;
  pins: readonly PinRecord[];
  longitude: number;
  latitude: number;
  elevation: number | null;
  elevationSource: string | null;
  onClose: () => void;
  onAdd: (pin: Omit<PinRecord, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdate: (pin: PinRecord) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onGoTo: (pin: PinRecord) => void;
}

export function PinPanel(props: PinPanelProps) {
  const [editing, setEditing] = useState<PinRecord | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<PinType>('trace-candidate');
  const [memo, setMemo] = useState('');

  if (!props.open) return null;

  const resetForm = () => { setEditing(null); setName(''); setType('trace-candidate'); setMemo(''); };
  const edit = (pin: PinRecord) => { setEditing(pin); setName(pin.name); setType(pin.type); setMemo(pin.memo); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (editing) {
      props.onUpdate({ ...editing, name: name.trim() || '名称未設定', type, memo });
    } else {
      props.onAdd({
        name: name.trim() || '名称未設定', type, memo,
        longitude: props.longitude, latitude: props.latitude,
        elevation: props.elevation, elevationSource: props.elevationSource,
      });
    }
    resetForm();
  };

  return (
    <aside className="data-drawer" aria-label="ピン管理">
      <header><h2>ピン</h2><button type="button" aria-label="ピン管理を閉じる" onClick={props.onClose}>×</button></header>
      <form className="pin-form" onSubmit={submit}>
        <p>{editing ? '選択したピンを編集' : '現在の地図中心にピンを追加'}</p>
        <label>名称<input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} /></label>
        <label>種別
          <select value={type} onChange={(event) => setType(event.target.value as PinType)}>
            {Object.entries(pinTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>メモ<textarea value={memo} maxLength={2000} rows={3} onChange={(event) => setMemo(event.target.value)} /></label>
        <div className="form-actions">
          <button type="submit">{editing ? '更新' : '中心に追加'}</button>
          {editing && <button type="button" onClick={resetForm}>編集を中止</button>}
        </div>
      </form>
      <div className="pin-list-header">
        <strong>保存済み：{props.pins.length}件</strong>
        <button type="button" disabled={props.pins.length === 0} onClick={() => {
          if (window.confirm('保存したピンをすべて削除しますか？')) props.onClear();
        }}>全削除</button>
      </div>
      <ul className="pin-list">
        {props.pins.map((pin) => (
          <li key={pin.id}>
            <strong>{pin.name}</strong><span>{pinTypeLabels[pin.type]}</span>
            <small>{pin.latitude.toFixed(6)}, {pin.longitude.toFixed(6)}</small>
            {pin.memo && <p>{pin.memo}</p>}
            <div>
              <button type="button" onClick={() => props.onGoTo(pin)}>地点へ移動</button>
              <button type="button" onClick={() => edit(pin)}>編集</button>
              <button type="button" onClick={() => {
                if (window.confirm(`${pin.name}を削除しますか？`)) props.onDelete(pin.id);
              }}>削除</button>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

