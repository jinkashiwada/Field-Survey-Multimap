import type { Project } from './model';
export interface History {
  past: Project[];
  present: Project;
  future: Project[];
}
export type HistoryAction =
  | { type: 'change'; update: (p: Project) => Project; record?: boolean }
  | { type: 'replace'; project: Project }
  | { type: 'undo' | 'redo' };
export function historyReducer(state: History, action: HistoryAction): History {
  if (action.type === 'replace')
    return { past: [], present: action.project, future: [] };
  if (action.type === 'change') {
    const present = action.update(state.present);
    if (present === state.present) return state;
    return {
      past:
        action.record === false
          ? state.past
          : [...state.past.slice(-49), state.present],
      present,
      future: [],
    };
  }
  if (action.type === 'undo' && state.past.length)
    return {
      past: state.past.slice(0, -1),
      present: state.past[state.past.length - 1]!,
      future: [state.present, ...state.future],
    };
  if (action.type === 'redo' && state.future.length)
    return {
      past: [...state.past, state.present],
      present: state.future[0]!,
      future: state.future.slice(1),
    };
  return state;
}
