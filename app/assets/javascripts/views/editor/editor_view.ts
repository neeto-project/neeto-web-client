import { Editor } from '@/ui_models/editor';
import { WebApplication } from '@/ui_models/application';
import { PanelPuppet, WebDirective } from '@/types';
import angular from 'angular';
import {
  ApplicationEvent,
  isPayloadSourceRetrieved,
  ContentType,
  ProtectedAction,
  SNComponent,
  SNNote,
  SNTag,
  NoteMutator,
  Uuids,
  ComponentArea,
  ComponentAction,
  WebPrefKey,
  ComponentMutator,
} from 'snjs';
import find from 'lodash/find';
import { isDesktopApplication } from '@/utils';
import { KeyboardModifier, KeyboardKey } from '@/services/keyboardManager';
import template from './editor-view.pug';
import { PureViewCtrl } from '@Views/abstract/pure_view_ctrl';
import { AppStateEvent, EventSource } from '@/ui_models/app_state';
import {
  STRING_DELETED_NOTE,
  STRING_INVALID_NOTE,
  STRING_ELLIPSES,
  STRING_DELETE_PLACEHOLDER_ATTEMPT,
  STRING_DELETE_LOCKED_ATTEMPT,
  StringDeleteNote,
  StringEmptyTrash
} from '@/strings';
import { confirmDialog } from '@/services/alertService';

const NOTE_PREVIEW_CHAR_LIMIT = 80;
const MINIMUM_STATUS_DURATION = 400;
const SAVE_TIMEOUT_DEBOUNCE = 350;
const SAVE_TIMEOUT_NO_DEBOUNCE = 100;
const EDITOR_DEBOUNCE = 100;

const ElementIds = {
  NoteTextEditor: 'note-text-editor',
  NoteTitleEditor: 'note-title-editor',
  EditorContent: 'editor-content',
  NoteTagsComponentContainer: 'note-tags-component-container'
};
const Fonts = {
  DesktopMonospaceFamily: `Menlo,Consolas,'DejaVu Sans Mono',monospace`,
  WebMonospaceFamily: `monospace`,
  SansSerifFamily: `inherit`
};

type NoteStatus = {
  message?: string
  date?: Date
}

type EditorState = {
  stackComponents: SNComponent[]
  editorComponent?: SNComponent
  tagsComponent?: SNComponent
  saveError?: any
  noteStatus?: NoteStatus
  tagsAsStrings?: string
  marginResizersEnabled?: boolean
  monospaceFont?: boolean
  isDesktop?: boolean
  syncTakingTooLong: boolean
  showActionsMenu: boolean
  showOptionsMenu: boolean
  showEditorMenu: boolean
  showHistoryMenu: boolean
  altKeyDown: boolean
  spellcheck: boolean
  /**
   * Setting to false then true will allow the current editor component-view to be destroyed
   * then re-initialized. Used when changing between component editors.
   */
  editorUnloading: boolean
  /** Setting to true then false will allow the main content textarea to be destroyed
   * then re-initialized. Used when reloading spellcheck status. */
  textareaUnloading: boolean
  /** Fields that can be directly mutated by the template */
  mutable: {}
}

type EditorValues = {
  title?: string
  text?: string
  tagsInputValue?: string
}

function sortAlphabetically(array: SNComponent[]): SNComponent[] {
  return array.sort((a, b) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1);
}

class EditorViewCtrl extends PureViewCtrl<{}, EditorState> {
  /** Passed through template */
  readonly application!: WebApplication
  readonly editor!: Editor

  private leftPanelPuppet?: PanelPuppet
  private rightPanelPuppet?: PanelPuppet
  private unregisterComponent: any
  private saveTimeout?: ng.IPromise<void>
  private statusTimeout?: ng.IPromise<void>
  private lastEditorFocusEventSource?: EventSource
  public editorValues: EditorValues = {}
  onEditorLoad?: () => void

  private removeAltKeyObserver?: any
  private removeTrashKeyObserver?: any
  private removeDeleteKeyObserver?: any
  private removeTabObserver?: any

  private removeTagsObserver!: () => void
  private removeComponentsObserver!: () => void

  prefKeyMonospace: string
  prefKeySpellcheck: string
  prefKeyMarginResizers: string

  /* @ngInject */
  constructor($timeout: ng.ITimeoutService) {
    super($timeout);
    this.leftPanelPuppet = {
      onReady: () => this.reloadPreferences()
    };
    this.rightPanelPuppet = {
      onReady: () => this.reloadPreferences()
    };
    /** Used by .pug template */
    this.prefKeyMonospace = WebPrefKey.EditorMonospaceEnabled;
    this.prefKeySpellcheck = WebPrefKey.EditorSpellcheck;
    this.prefKeyMarginResizers = WebPrefKey.EditorResizersEnabled;

    this.editorMenuOnSelect = this.editorMenuOnSelect.bind(this);
    this.onPanelResizeFinish = this.onPanelResizeFinish.bind(this);
    this.onEditorLoad = () => {
      this.application!.getDesktopService().redoSearch();
    }
  }

  deinit() {
    this.editor.clearNoteChangeListener();
    this.removeTagsObserver();
    this.removeComponentsObserver();
    (this.removeTagsObserver as any) = undefined;
    (this.removeComponentsObserver as any) = undefined;
    this.removeAltKeyObserver();
    this.removeAltKeyObserver = undefined;
    this.removeTrashKeyObserver();
    this.removeTrashKeyObserver = undefined;
    this.removeDeleteKeyObserver();
    this.removeDeleteKeyObserver = undefined;
    this.removeTabObserver && this.removeTabObserver();
    this.removeTabObserver = undefined;
    this.leftPanelPuppet = undefined;
    this.rightPanelPuppet = undefined;
    this.onEditorLoad = undefined;
    this.unregisterComponent();
    this.unregisterComponent = undefined;
    this.saveTimeout = undefined;
    this.statusTimeout = undefined;
    (this.onPanelResizeFinish as any) = undefined;
    (this.editorMenuOnSelect as any) = undefined;
    super.deinit();
  }

  getState() {
    return this.state as EditorState;
  }

  get note() {
    return this.editor.note;
  }

  $onInit() {
    super.$onInit();
    this.registerKeyboardShortcuts();
    this.editor.onNoteChange(() => {
      this.handleEditorNoteChange();
    })
    this.editor.onNoteValueChange((note, source) => {
      if (isPayloadSourceRetrieved(source!)) {
        this.editorValues.title = note.title;
        this.editorValues.text = note.text;
        this.reloadTagsString();
      }
      if (!this.editorValues.title) {
        this.editorValues.title = note.title;
      }
      if (!this.editorValues.text) {
        this.editorValues.text = note.text;
      }
      if (note.lastSyncBegan) {
        if (note.lastSyncEnd) {
          if (note.lastSyncBegan!.getTime() > note.lastSyncEnd!.getTime()) {
            this.showSavingStatus()
          } else if (note.lastSyncEnd!.getTime() > note.lastSyncBegan!.getTime()) {
            this.showAllChangesSavedStatus();
          }
        } else {
          this.showSavingStatus();
        }
      }
    });
  }

  /** @override */
  getInitialState() {
    return {
      stackComponents: [],
      editorDebounce: EDITOR_DEBOUNCE,
      isDesktop: isDesktopApplication(),
      spellcheck: true,
      syncTakingTooLong: false,
      showActionsMenu: false,
      showOptionsMenu: false,
      showEditorMenu: false,
      showHistoryMenu: false,
      altKeyDown: false,
      noteStatus: undefined,
      editorUnloading: false,
      textareaUnloading: false,
      mutable: {
        tagsString: ''
      }
    } as EditorState;
  }

  async onAppLaunch() {
    await super.onAppLaunch();
    this.streamItems();
    this.registerComponentHandler();
  }

  /** @override */
  onAppStateEvent(eventName: AppStateEvent, data: any) {
    if (eventName === AppStateEvent.PreferencesChanged) {
      this.reloadPreferences();
    }
  }

  /** @override */
  onAppEvent(eventName: ApplicationEvent) {
    if (eventName === ApplicationEvent.HighLatencySync) {
      this.setState({ syncTakingTooLong: true });
    } else if (eventName === ApplicationEvent.CompletedFullSync) {
      this.setState({ syncTakingTooLong: false });
      const isInErrorState = this.state.saveError;
      /** if we're still dirty, don't change status, a sync is likely upcoming. */
      if (!this.note.dirty && isInErrorState) {
        this.showAllChangesSavedStatus();
      }
    } else if (eventName === ApplicationEvent.FailedSync) {
      /**
       * Only show error status in editor if the note is dirty.
       * Otherwise, it means the originating sync came from somewhere else
       * and we don't want to display an error here.
       */
      if (this.note.dirty) {
        this.showErrorStatus();
      }
    } else if (eventName === ApplicationEvent.LocalDatabaseWriteError) {
      this.showErrorStatus({
        message: "Offline Saving Issue",
        desc: "Changes not saved"
      });
    }
  }

  async handleEditorNoteChange() {
    this.cancelPendingSetStatus();
    await this.setState({
      showActionsMenu: false,
      showOptionsMenu: false,
      showEditorMenu: false,
      showHistoryMenu: false,
      altKeyDown: false,
      noteStatus: undefined
    });
    const note = this.editor.note;
    this.editorValues.title = note.title;
    this.editorValues.text = note.text;
    this.reloadEditor();
    this.reloadTagsString();
    this.reloadPreferences();
    this.reloadStackComponents();
    if (note.safeText().length === 0) {
      this.focusTitle();
    }
  }

  /**
   * Because note.locked accesses note.content.appData,
   * we do not want to expose the template to direct access to note.locked,
   * otherwise an exception will occur when trying to access note.locked if the note
   * is deleted. There is potential for race conditions to occur with setState, where a
   * previous setState call may have queued a digest cycle, and the digest cycle triggers
   * on a deleted note.
   */
  get noteLocked() {
    if (!this.note || this.note.deleted) {
      return false;
    }
    return this.note.locked;
  }

  streamItems() {
    this.removeTagsObserver = this.application.streamItems(
      ContentType.Tag,
      (items) => {
        if (!this.note) {
          return;
        }
        for (const tag of items) {
          if (
            !this.editorValues.tagsInputValue ||
            tag.deleted ||
            tag.hasRelationshipWithItem(this.note)
          ) {
            this.reloadTagsString();
            break;
          }
        }
      }
    );

    this.removeComponentsObserver = this.application.streamItems(
      ContentType.Component,
      async () => {
        if (!this.note) return;
        this.reloadStackComponents();
        this.reloadNoteTagsComponent();
        this.reloadEditor();
      }
    );
  }

  private async reloadEditor() {
    const newEditor = this.application.componentManager!.editorForNote(this.note);
    const currentEditor = this.state.editorComponent;
    if (currentEditor?.uuid !== newEditor?.uuid) {
      const unloading = this.setState({
        /** Unload current component view so that we create a new one */
        editorUnloading: true
      });
      if (newEditor) {
        /** Register this new editor while the editor view is reloading */
        this.application.componentManager!.registerComponent(newEditor.uuid);
      }
      await unloading;
      const reloading = this.setState({
        /** Reload component view */
        editorComponent: newEditor,
        editorUnloading: false,
      });
      if (currentEditor) {
        /** Deregister the current (previous) editor while the editor view is reloading */
        this.application.componentManager!.deregisterComponent(currentEditor.uuid);
      }
      await reloading;
      this.reloadFont();
    }
    this.application.componentManager!.contextItemDidChangeInArea(ComponentArea.Editor);
  }

  setMenuState(menu: string, state: boolean) {
    this.setState({
      [menu]: state
    });
    this.closeAllMenus(menu);
  }

  toggleMenu(menu: keyof EditorState) {
    this.setMenuState(menu, !this.state[menu]);
  }

  closeAllMenus(exclude?: string) {
    const allMenus = [
      'showOptionsMenu',
      'showEditorMenu',
      'showActionsMenu',
      'showHistoryMenu',
    ];
    const menuState: any = {};
    for (const candidate of allMenus) {
      if (candidate !== exclude) {
        menuState[candidate] = false;
      }
    }
    this.setState(menuState);
  }

  async editorMenuOnSelect(component?: SNComponent) {
    this.setMenuState('showEditorMenu', false);
    if (!component) {
      if (!this.note.prefersPlainEditor) {
        await this.application.changeItem(this.note.uuid, (mutator) => {
          const noteMutator = mutator as NoteMutator;
          noteMutator.prefersPlainEditor = true;
        })
      }
      if (this.state.editorComponent?.isExplicitlyEnabledForItem(this.note.uuid)) {
        await this.disassociateComponentWithCurrentNote(this.state.editorComponent);
      }
      this.reloadFont();
    }
    else if (component.area === ComponentArea.Editor) {
      const currentEditor = this.state.editorComponent;
      if (currentEditor && component !== currentEditor) {
        await this.disassociateComponentWithCurrentNote(currentEditor);
      }
      const prefersPlain = this.note.prefersPlainEditor;
      if (prefersPlain) {
        await this.application.changeItem(this.note.uuid, (mutator) => {
          const noteMutator = mutator as NoteMutator;
          noteMutator.prefersPlainEditor = false;
        })
      }
      await this.associateComponentWithCurrentNote(component);
    }
    else if (component.area === ComponentArea.EditorStack) {
      await this.toggleStackComponentForCurrentItem(component);
    }
    /** Dirtying can happen above */
    this.application.sync();
  }

  hasAvailableExtensions() {
    return this.application.actionsManager!.
      extensionsInContextOfItem(this.note).length > 0;
  }

  performFirefoxPinnedTabFix() {
    /**
     * For Firefox pinned tab issue:
     * When a new browser session is started, and SN is in a pinned tab,
     * SN is unusable until the tab is reloaded.
     */
    if (document.hidden) {
      window.location.reload();
    }
  }

  /**
   * @param bypassDebouncer Calling save will debounce by default. You can pass true to save
   * immediately.
   * @param isUserModified This field determines if the item will be saved as a user
   * modification, thus updating the user modified date displayed in the UI
   * @param dontUpdatePreviews Whether this change should update the note's plain and HTML
   * preview.
   * @param customMutate A custom mutator function.
   * @param closeAfterSync Whether this editor should be closed after the sync starts.
   * This allows us to make a destructive change, wait for sync to be triggered, then
   * close the editor (if we closed the editor before sync began, we'd get an exception,
   * since the debouncer will be triggered on a non-existent editor)
   */
  async saveNote(
    bypassDebouncer = false,
    isUserModified = false,
    dontUpdatePreviews = false,
    customMutate?: (mutator: NoteMutator) => void,
    closeAfterSync = false
  ) {
    this.performFirefoxPinnedTabFix();
    const note = this.note;
    if (note.deleted) {
      this.application.alertService!.alert(
        STRING_DELETED_NOTE
      );
      return;
    }
    if (this.editor.isTemplateNote) {
      await this.editor.insertTemplatedNote();
      if (this.appState.selectedTag?.isSmartTag() === false) {
        await this.application.changeItem(
          this.appState.selectedTag!.uuid,
          (mutator) => {
            mutator.addItemAsRelationship(note);
          }
        )
      }
    }
    if (!this.application.findItem(note.uuid)) {
      this.application.alertService!.alert(
        STRING_INVALID_NOTE
      );
      return;
    }
    await this.application.changeItem(note.uuid, (mutator) => {
      const noteMutator = mutator as NoteMutator;
      if (customMutate) {
        customMutate(noteMutator);
      }
      noteMutator.title = this.editorValues.title!;
      noteMutator.text = this.editorValues.text!;
      if (!dontUpdatePreviews) {
        const text = this.editorValues.text || '';
        const truncate = text.length > NOTE_PREVIEW_CHAR_LIMIT;
        const substring = text.substring(0, NOTE_PREVIEW_CHAR_LIMIT);
        const previewPlain = substring + (truncate ? STRING_ELLIPSES : '');
        noteMutator.preview_plain = previewPlain;
        noteMutator.preview_html = undefined;
      }
    }, isUserModified)
    if (this.saveTimeout) {
      this.$timeout.cancel(this.saveTimeout);
    }
    const noDebounce = bypassDebouncer || this.application.noAccount();
    const syncDebouceMs = noDebounce
      ? SAVE_TIMEOUT_NO_DEBOUNCE
      : SAVE_TIMEOUT_DEBOUNCE;
    this.saveTimeout = this.$timeout(() => {
      this.application.sync();
      if (closeAfterSync) {
        this.appState.closeEditor(this.editor);
      }
    }, syncDebouceMs);
  }

  showSavingStatus() {
    this.setStatus(
      { message: "Saving…" },
      false
    );
  }

  showAllChangesSavedStatus() {
    this.setState({
      saveError: false,
      syncTakingTooLong: false
    });
    this.setStatus({
      message: 'All changes saved',
    });
  }

  showErrorStatus(error?: any) {
    if (!error) {
      error = {
        message: "Sync Unreachable",
        desc: "Changes saved offline"
      };
    }
    this.setState({
      saveError: true,
      syncTakingTooLong: false
    });
    this.setStatus(error);
  }

  setStatus(status: { message: string }, wait = true) {
    if (this.statusTimeout) {
      this.$timeout.cancel(this.statusTimeout);
    }
    if (wait) {
      this.statusTimeout = this.$timeout(() => {
        this.setState({
          noteStatus: status
        })
      }, MINIMUM_STATUS_DURATION);
    } else {
      this.setState({
        noteStatus: status
      });
    }
  }

  cancelPendingSetStatus() {
    if (this.statusTimeout) {
      this.$timeout.cancel(this.statusTimeout);
    }
  }

  contentChanged() {
    this.saveNote(
      false,
      true
    );
  }

  onTitleEnter($event: Event) {
    ($event.target as HTMLInputElement).blur();
    this.onTitleChange();
    this.focusEditor();
  }

  onTitleChange() {
    this.saveNote(
      false,
      true,
      true,
    );
  }

  focusEditor() {
    const element = document.getElementById(ElementIds.NoteTextEditor);
    if (element) {
      this.lastEditorFocusEventSource = EventSource.Script;
      element.focus();
    }
  }

  focusTitle() {
    document.getElementById(ElementIds.NoteTitleEditor)!.focus();
  }

  clickedTextArea() {
    this.setMenuState('showOptionsMenu', false);
  }

  onTitleFocus() {

  }

  onTitleBlur() {

  }

  onContentFocus() {
    this.application.getAppState().editorDidFocus(this.lastEditorFocusEventSource!);
    this.lastEditorFocusEventSource = undefined;
  }

  selectedMenuItem(hide: boolean) {
    if (hide) {
      this.setMenuState('showOptionsMenu', false);
    }
  }

  async deleteNote(permanently: boolean) {
    if (this.editor.isTemplateNote) {
      this.application.alertService!.alert(
        STRING_DELETE_PLACEHOLDER_ATTEMPT
      );
      return;
    }
    const run = async () => {
      if (this.note.locked) {
        this.application.alertService!.alert(
          STRING_DELETE_LOCKED_ATTEMPT
        );
        return;
      }
      const title = this.note.safeTitle().length
        ? `'${this.note.title}'`
        : "this note";
      const text = StringDeleteNote(
        title,
        permanently
      );
      if (await confirmDialog({
        text,
        confirmButtonStyle: 'danger'
      })) {
        if (permanently) {
          this.performNoteDeletion(this.note);
        } else {
          this.saveNote(
            true,
            false,
            true,
            (mutator) => {
              mutator.trashed = true;
            }
          );
        }
      };
    };
    const requiresPrivilege = await this.application.privilegesService!.actionRequiresPrivilege(
      ProtectedAction.DeleteNote
    );
    if (requiresPrivilege) {
      this.application.presentPrivilegesModal(
        ProtectedAction.DeleteNote,
        () => {
          run();
        }
      );
    } else {
      run();
    }
  }

  performNoteDeletion(note: SNNote) {
    this.application.deleteItem(note);
  }

  restoreTrashedNote() {
    this.saveNote(
      true,
      false,
      true,
      (mutator) => {
        mutator.trashed = false;
      },
      true
    );
  }

  deleteNotePermanantely() {
    this.deleteNote(true);
  }

  getTrashCount() {
    return this.application.getTrashedItems().length;
  }

  async emptyTrash() {
    const count = this.getTrashCount();
    if (await confirmDialog({
      text: StringEmptyTrash(count),
      confirmButtonStyle: 'danger'
    })) {
      this.application.emptyTrash();
      this.application.sync();
    }
  }

  togglePin() {
    this.saveNote(
      true,
      false,
      true,
      (mutator) => {
        mutator.pinned = !this.note.pinned
      }
    );
  }

  toggleLockNote() {
    this.saveNote(
      true,
      false,
      true,
      (mutator) => {
        mutator.locked = !this.note.locked
      }
    );
  }

  toggleProtectNote() {
    this.saveNote(
      true,
      false,
      true,
      (mutator) => {
        mutator.protected = !this.note.protected
      }
    );
    /** Show privileges manager if protection is not yet set up */
    this.application.privilegesService!.actionHasPrivilegesConfigured(
      ProtectedAction.ViewProtectedNotes
    ).then((configured) => {
      if (!configured) {
        this.application.presentPrivilegesManagementModal();
      }
    });
  }

  toggleNotePreview() {
    this.saveNote(
      true,
      false,
      true,
      (mutator) => {
        mutator.hidePreview = !this.note.hidePreview
      }
    );
  }

  toggleArchiveNote() {
    this.saveNote(
      true,
      false,
      true,
      (mutator) => {
        mutator.archived = !this.note.archived
      },
      /** If we are unarchiving, and we are in the archived tag, close the editor */
      this.note.archived && this.appState.selectedTag?.isArchiveTag
    );
  }

  async reloadTagsString() {
    const tags = this.appState.getNoteTags(this.note);
    const string = SNTag.arrayToDisplayString(tags);
    await this.flushUI();
    this.editorValues.tagsInputValue = string;
  }

  private addTag(tag: SNTag) {
    const tags = this.appState.getNoteTags(this.note);
    const strings = tags.map((currentTag) => {
      return currentTag.title;
    });
    strings.push(tag.title);
    this.saveTagsFromStrings(strings);
  }

  removeTag(tag: SNTag) {
    const tags = this.appState.getNoteTags(this.note);
    const strings = tags.map((currentTag) => {
      return currentTag.title;
    }).filter((title) => {
      return title !== tag.title;
    });
    this.saveTagsFromStrings(strings);
  }

  onTagsInputBlur() {
    this.saveTagsFromStrings();
    this.focusEditor();
  }

  public async saveTagsFromStrings(strings?: string[]) {
    if (
      !strings
      && this.editorValues.tagsInputValue === this.state.tagsAsStrings
    ) {
      return;
    }
    if (!strings) {
      strings = this.editorValues.tagsInputValue!
        .split('#')
        .filter((string) => {
          return string.length > 0;
        })
        .map((string) => {
          return string.trim();
        });
    }
    const note = this.note;
    const currentTags = this.appState.getNoteTags(note);
    const removeTags = [];
    for (const tag of currentTags) {
      if (strings.indexOf(tag.title) === -1) {
        removeTags.push(tag);
      }
    }
    for (const tag of removeTags) {
      await this.application.changeItem(tag.uuid, (mutator) => {
        mutator.removeItemAsRelationship(note);
      })
    }
    const newRelationships: SNTag[] = [];
    for (const title of strings) {
      const existingRelationship = find(
        currentTags,
        { title: title }
      );
      if (!existingRelationship) {
        newRelationships.push(
          await this.application.findOrCreateTag(title)
        );
      }
    }
    if (newRelationships.length > 0) {
      await this.application.changeItems(
        Uuids(newRelationships),
        (mutator) => {
          mutator.addItemAsRelationship(note);
        }
      )
    }
    this.application.sync();
    this.reloadTagsString();
  }

  async onPanelResizeFinish(width: number, left: number, isMaxWidth: boolean) {
    if (isMaxWidth) {
      await this.application.getPrefsService().setUserPrefValue(
        WebPrefKey.EditorWidth,
        null
      );
    } else {
      if (width !== undefined && width !== null) {
        await this.application.getPrefsService().setUserPrefValue(
          WebPrefKey.EditorWidth,
          width
        );
        this.leftPanelPuppet!.setWidth!(width);
      }
    }
    if (left !== undefined && left !== null) {
      await this.application.getPrefsService().setUserPrefValue(
        WebPrefKey.EditorLeft,
        left
      );
      this.rightPanelPuppet!.setLeft!(left);
    }
    this.application.getPrefsService().syncUserPreferences();
  }

  async reloadPreferences() {
    const monospaceFont = this.application.getPrefsService().getValue(
      WebPrefKey.EditorMonospaceEnabled,
      true
    );
    const spellcheck = this.application.getPrefsService().getValue(
      WebPrefKey.EditorSpellcheck,
      true
    );
    const marginResizersEnabled = this.application.getPrefsService().getValue(
      WebPrefKey.EditorResizersEnabled,
      true
    );
    await this.setState({
      monospaceFont,
      spellcheck,
      marginResizersEnabled
    });

    if (!document.getElementById(ElementIds.EditorContent)) {
      /** Elements have not yet loaded due to ng-if around wrapper */
      return;
    }

    this.reloadFont();

    if (
      this.state.marginResizersEnabled &&
      this.leftPanelPuppet!.ready &&
      this.rightPanelPuppet!.ready
    ) {
      const width = this.application.getPrefsService().getValue(
        WebPrefKey.EditorWidth,
        null
      );
      if (width != null) {
        this.leftPanelPuppet!.setWidth!(width);
        this.rightPanelPuppet!.setWidth!(width);
      }
      const left = this.application.getPrefsService().getValue(
        WebPrefKey.EditorLeft,
        null
      );
      if (left != null) {
        this.leftPanelPuppet!.setLeft!(left);
        this.rightPanelPuppet!.setLeft!(left);
      }
    }
  }

  reloadFont() {
    const editor = document.getElementById(
      ElementIds.NoteTextEditor
    );
    if (!editor) {
      return;
    }
    if (this.state.monospaceFont) {
      if (this.state.isDesktop) {
        editor.style.fontFamily = Fonts.DesktopMonospaceFamily;
      } else {
        editor.style.fontFamily = Fonts.WebMonospaceFamily;
      }
    } else {
      editor.style.fontFamily = Fonts.SansSerifFamily;
    }
  }

  async toggleWebPrefKey(key: WebPrefKey) {
    const currentValue = (this.state as any)[key];
    await this.application.getPrefsService().setUserPrefValue(
      key,
      !currentValue,
      true
    );
    await this.setState({
      [key]: !currentValue
    })
    this.reloadFont();

    if (key === WebPrefKey.EditorSpellcheck) {
      /** Allows textarea to reload */
      await this.setState({ textareaUnloading: true });
      await this.setState({ textareaUnloading: false });
      this.reloadFont();
    } else if (key === WebPrefKey.EditorResizersEnabled && this.state[key] === true) {
      this.$timeout(() => {
        this.leftPanelPuppet!.flash!();
        this.rightPanelPuppet!.flash!();
      });
    }
  }

  /** @components */

  registerComponentHandler() {
    this.unregisterComponent = this.application.componentManager!.registerHandler({
      identifier: 'editor',
      areas: [
        ComponentArea.NoteTags,
        ComponentArea.EditorStack,
        ComponentArea.Editor
      ],
      contextRequestHandler: (componentUuid) => {
        const currentEditor = this.state.editorComponent;
        if (
          componentUuid === currentEditor?.uuid ||
          componentUuid === this.state.tagsComponent?.uuid ||
          Uuids(this.state.stackComponents).includes(componentUuid)
        ) {
          return this.note;
        }
      },
      focusHandler: (component, focused) => {
        if (component.isEditor() && focused) {
          this.closeAllMenus();
        }
      },
      actionHandler: (component, action, data) => {
        if (action === ComponentAction.SetSize) {
          const setSize = (
            element: HTMLElement,
            size: { width: number, height: number }
          ) => {
            const widthString = typeof size.width === 'string'
              ? size.width
              : `${data.width}px`;
            const heightString = typeof size.height === 'string'
              ? size.height
              : `${data.height}px`;
            element.setAttribute(
              'style',
              `width: ${widthString}; height: ${heightString};`
            );
          };
          if (data.type === 'container') {
            if (component.area === ComponentArea.NoteTags) {
              const container = document.getElementById(
                ElementIds.NoteTagsComponentContainer
              );
              setSize(container!, data);
            }
          }
        }
        else if (action === ComponentAction.AssociateItem) {
          if (data.item.content_type === ContentType.Tag) {
            const tag = this.application.findItem(data.item.uuid) as SNTag;
            this.addTag(tag);
          }
        }
        else if (action === ComponentAction.DeassociateItem) {
          const tag = this.application.findItem(data.item.uuid) as SNTag;
          this.removeTag(tag);
        }
      }
    });
  }

  reloadNoteTagsComponent() {
    const [tagsComponent] =
      this.application.componentManager!.componentsForArea(ComponentArea.NoteTags);
    if (tagsComponent?.uuid !== this.state.tagsComponent?.uuid) {
      this.setState({
        tagsComponent: tagsComponent?.active ? tagsComponent : undefined
      });
    }
    this.application.componentManager!.contextItemDidChangeInArea(ComponentArea.NoteTags);
  }

  reloadStackComponents() {
    this.setState({
      stackComponents: sortAlphabetically(
        this.application.componentManager!.componentsForArea(ComponentArea.EditorStack)
          .filter(component => component.active)
      )
    });
    if (this.note) {
      for (const component of this.state.stackComponents) {
        if (component.active) {
          this.application.componentManager!.setComponentHidden(
            component,
            !component.isExplicitlyEnabledForItem(this.note.uuid)
          );
        }
      }
    }
    this.application.componentManager!.contextItemDidChangeInArea(ComponentArea.EditorStack);
  }


  stackComponentHidden(component: SNComponent) {
    return this.application.componentManager?.isComponentHidden(component);
  }

  async toggleStackComponentForCurrentItem(component: SNComponent) {
    const hidden = this.application.componentManager!.isComponentHidden(component);
    if (hidden || !component.active) {
      this.application.componentManager!.setComponentHidden(component, false);
      await this.associateComponentWithCurrentNote(component);
      this.application.componentManager!.contextItemDidChangeInArea(ComponentArea.EditorStack);
    } else {
      this.application.componentManager!.setComponentHidden(component, true);
      await this.disassociateComponentWithCurrentNote(component);
    }
    this.application.sync();
  }

  async disassociateComponentWithCurrentNote(component: SNComponent) {
    const note = this.note;
    return this.application.changeItem(component.uuid, (m) => {
      const mutator = m as ComponentMutator;
      mutator.removeAssociatedItemId(note.uuid);
      mutator.disassociateWithItem(note.uuid);
    })
  }

  async associateComponentWithCurrentNote(component: SNComponent) {
    const note = this.note;
    return this.application.changeItem(component.uuid, (m) => {
      const mutator = m as ComponentMutator;
      mutator.removeDisassociatedItemId(note.uuid);
      mutator.associateWithItem(note.uuid);
    })
  }

  registerKeyboardShortcuts() {
    this.removeAltKeyObserver = this.application.getKeyboardService().addKeyObserver({
      modifiers: [
        KeyboardModifier.Alt
      ],
      onKeyDown: () => {
        this.setState({
          altKeyDown: true
        });
      },
      onKeyUp: () => {
        this.setState({
          altKeyDown: false
        });
      }
    });

    this.removeTrashKeyObserver = this.application.getKeyboardService().addKeyObserver({
      key: KeyboardKey.Backspace,
      notElementIds: [
        ElementIds.NoteTextEditor,
        ElementIds.NoteTitleEditor
      ],
      modifiers: [KeyboardModifier.Meta],
      onKeyDown: () => {
        this.deleteNote(false);
      },
    });

    this.removeDeleteKeyObserver = this.application.getKeyboardService().addKeyObserver({
      key: KeyboardKey.Backspace,
      modifiers: [
        KeyboardModifier.Meta,
        KeyboardModifier.Shift,
        KeyboardModifier.Alt
      ],
      onKeyDown: (event) => {
        event.preventDefault();
        this.deleteNote(true);
      },
    });
  }

  onSystemEditorLoad() {
    if (this.removeTabObserver) {
      return;
    }
    /**
     * Insert 4 spaces when a tab key is pressed,
     * only used when inside of the text editor.
     * If the shift key is pressed first, this event is
     * not fired.
    */
    const editor = document.getElementById(ElementIds.NoteTextEditor)! as HTMLInputElement;
    this.removeTabObserver = this.application.getKeyboardService().addKeyObserver({
      element: editor,
      key: KeyboardKey.Tab,
      onKeyDown: (event) => {
        if (this.note.locked || event.shiftKey) {
          return;
        }
        event.preventDefault();
        /** Using document.execCommand gives us undo support */
        const insertSuccessful = document.execCommand(
          'insertText',
          false,
          '\t'
        );
        if (!insertSuccessful) {
          /** document.execCommand works great on Chrome/Safari but not Firefox */
          const start = editor.selectionStart!;
          const end = editor.selectionEnd!;
          const spaces = '    ';
          /** Insert 4 spaces */
          editor.value = editor.value.substring(0, start)
            + spaces + editor.value.substring(end);
          /** Place cursor 4 spaces away from where the tab key was pressed */
          editor.selectionStart = editor.selectionEnd = start + 4;
        }
        this.editorValues.text = editor.value;
        this.saveNote(true);
      },
    });

    /**
     * Handles when the editor is destroyed,
     * (and not when our controller is destroyed.)
     */
    angular.element(editor).one('$destroy', () => {
      this.removeTabObserver();
      this.removeTabObserver = undefined;
    });
  }
}

export class EditorView extends WebDirective {
  constructor() {
    super();
    this.restrict = 'E';
    this.scope = {
      editor: '=',
      application: '='
    };
    this.template = template;
    this.replace = true;
    this.controller = EditorViewCtrl;
    this.controllerAs = 'self';
    this.bindToController = true;
  }
}
