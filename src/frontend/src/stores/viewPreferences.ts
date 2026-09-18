import { proxy, subscribe } from 'valtio'
import { STORAGE_KEYS } from '@/utils/storageKeys'

/**
 * 'auto': grid, screen shares auto-focus (upstream behaviour).
 * 'gallery': always grid, screen shares are plain tiles.
 * 'speaker': focus the active (or last) remote speaker.
 */
export type LayoutMode = 'auto' | 'gallery' | 'speaker'

type State = {
  layoutMode: LayoutMode
  hideSelfView: boolean
  hideNonVideo: boolean
}

const DEFAULT_STATE: State = {
  layoutMode: 'auto',
  hideSelfView: false,
  hideNonVideo: false,
}

function getViewPreferencesState(): State {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.VIEW_PREFERENCES)
    return stored ? { ...DEFAULT_STATE, ...JSON.parse(stored) } : DEFAULT_STATE
  } catch {
    return DEFAULT_STATE
  }
}

export const viewPreferencesStore = proxy<State>(getViewPreferencesState())

subscribe(viewPreferencesStore, () => {
  try {
    localStorage.setItem(
      STORAGE_KEYS.VIEW_PREFERENCES,
      JSON.stringify(viewPreferencesStore)
    )
  } catch {
    // Storage unavailable (private mode, blocked site data): keep in-memory only.
  }
})
