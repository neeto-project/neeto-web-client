import { action, computed, makeObservable, observable } from 'mobx';

export class PreferencesState {
  private _open = false;

  constructor() {
    makeObservable<PreferencesState, '_open'>(this, {
      _open: observable,
      openPreferences: action,
      closePreferences: action,
      isOpen: computed,
    });
  }

  openPreferences = (): void => {
    this._open = true;
  };

  closePreferences = (): void => {
    this._open = false;
  };

  get isOpen() {
    return this._open;
  }
}
