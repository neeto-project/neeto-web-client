import { isDesktopApplication } from '@/utils';
import pull from 'lodash/pull';
import {
  ProtectedAction,
  ApplicationEvent,
  SNTag,
  SNNote,
  SNUserPrefs,
  ContentType,
  SNSmartTag,
  PayloadSource,
  DeinitSource,
  UuidString,
  SyncOpStatus
} from '@standardnotes/snjs';
import { WebApplication } from '@/ui_models/application';
import { Editor } from '@/ui_models/editor';
import { action, makeObservable, observable } from 'mobx';
import { Bridge } from '@/services/bridge';

export enum AppStateEvent {
  TagChanged = 1,
  ActiveEditorChanged = 2,
  PreferencesChanged = 3,
  PanelResized = 4,
  EditorFocused = 5,
  BeganBackupDownload = 6,
  EndedBackupDownload = 7,
  WindowDidFocus = 9,
  WindowDidBlur = 10,
};

export enum EventSource {
  UserInteraction = 1,
  Script = 2
};

type ObserverCallback = (event: AppStateEvent, data?: any) => Promise<void>

const SHOW_BETA_WARNING_KEY = 'show_beta_warning';

class ActionsMenuState {
  hiddenExtensions: Record<UuidString, boolean> = {};

  constructor() {
    makeObservable(this, {
      hiddenExtensions: observable,
      toggleExtensionVisibility: action,
      deinit: action,
    });
  }

  toggleExtensionVisibility(uuid: UuidString) {
    this.hiddenExtensions[uuid] = !this.hiddenExtensions[uuid];
  }

  deinit() {
    this.hiddenExtensions = {};
  }
}

export class SyncState {
  inProgress = false;
  errorMessage?: string = undefined;
  humanReadablePercentage?: string = undefined;

  constructor() {
    makeObservable(this, {
      inProgress: observable,
      errorMessage: observable,
      humanReadablePercentage: observable,
      update: action,
    });
  }

  update(status: SyncOpStatus) {
    this.errorMessage = status.error?.message;
    this.inProgress = status.syncInProgress;
    const stats = status.getStats();
    const completionPercentage = stats.uploadCompletionCount === 0
        ? 0
        : stats.uploadCompletionCount / stats.uploadTotalCount;

    if (completionPercentage === 0) {
      this.humanReadablePercentage = undefined;
    } else {
      this.humanReadablePercentage = completionPercentage.toLocaleString(
        undefined,
        { style: 'percent' }
      );
    }
  }
}

export class AppState {
  $rootScope: ng.IRootScopeService;
  $timeout: ng.ITimeoutService;
  application: WebApplication;
  observers: ObserverCallback[] = [];
  locked = true;
  unsubApp: any;
  rootScopeCleanup1: any;
  rootScopeCleanup2: any;
  onVisibilityChange: any;
  selectedTag?: SNTag;
  userPreferences?: SNUserPrefs;
  multiEditorEnabled = false;
  showBetaWarning = false;
  readonly actionsMenu = new ActionsMenuState();
  readonly sync = new SyncState();

  /* @ngInject */
  constructor(
    $rootScope: ng.IRootScopeService,
    $timeout: ng.ITimeoutService,
    application: WebApplication,
    private bridge: Bridge,
  ) {
    this.$timeout = $timeout;
    this.$rootScope = $rootScope;
    this.application = application;
    makeObservable(this, {
      showBetaWarning: observable,
      enableBetaWarning: action,
      disableBetaWarning: action,
    });
    this.addAppEventObserver();
    this.streamNotesAndTags();
    this.onVisibilityChange = () => {
      const visible = document.visibilityState === "visible";
      const event = visible
        ? AppStateEvent.WindowDidFocus
        : AppStateEvent.WindowDidBlur;
      this.notifyEvent(event);
    }
    this.registerVisibilityObservers();
    this.determineBetaWarningValue();
  }

  deinit(source: DeinitSource) {
    if (source === DeinitSource.SignOut) {
      localStorage.removeItem(SHOW_BETA_WARNING_KEY);
    }
    this.actionsMenu.deinit();
    this.unsubApp();
    this.unsubApp = undefined;
    this.observers.length = 0;
    if (this.rootScopeCleanup1) {
      this.rootScopeCleanup1();
      this.rootScopeCleanup2();
      this.rootScopeCleanup1 = undefined;
      this.rootScopeCleanup2 = undefined;
    }
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.onVisibilityChange = undefined;
  }

  disableBetaWarning() {
    this.showBetaWarning = false;
    localStorage.setItem(SHOW_BETA_WARNING_KEY, 'false');
  }

  enableBetaWarning() {
    this.showBetaWarning = true;
    localStorage.setItem(SHOW_BETA_WARNING_KEY, 'true');
  }

  clearBetaWarning() {
    localStorage.setItem(SHOW_BETA_WARNING_KEY, 'true');
  }

  private determineBetaWarningValue() {
    if (this.bridge.appVersion.includes('-beta')) {
      switch (localStorage.getItem(SHOW_BETA_WARNING_KEY)) {
        case 'true':
        default:
          this.enableBetaWarning();
          break;
        case 'false':
          this.disableBetaWarning();
          break;
      }
    }
  }

  /**
   * Creates a new editor if one doesn't exist. If one does, we'll replace the
   * editor's note with an empty one.
   */
  async createEditor(title?: string) {
    const activeEditor = this.getActiveEditor();
    const activeTagUuid = this.selectedTag
        ? this.selectedTag.isSmartTag()
          ? undefined
          : this.selectedTag.uuid
        : undefined;

    if (!activeEditor || this.multiEditorEnabled) {
      this.application.editorGroup.createEditor(
        undefined,
        title,
        activeTagUuid
      );
    } else {
      await activeEditor.reset(title, activeTagUuid);
    }
  }

  async openEditor(noteUuid: string) {
    const note = this.application.findItem(noteUuid) as SNNote;
    if (this.getActiveEditor()?.note?.uuid === noteUuid) return;
    const run = async () => {
      const activeEditor = this.getActiveEditor();
      if (!activeEditor || this.multiEditorEnabled) {
        this.application.editorGroup.createEditor(noteUuid);
      } else {
        activeEditor.setNote(note);
      }
      await this.notifyEvent(AppStateEvent.ActiveEditorChanged);
    };
    if (note && note.safeContent.protected &&
      await this.application.privilegesService!.actionRequiresPrivilege(
        ProtectedAction.ViewProtectedNotes
      )) {
      return new Promise((resolve) => {
        this.application.presentPrivilegesModal(
          ProtectedAction.ViewProtectedNotes,
          () => {
            run().then(resolve);
          }
        );
      });
    } else {
      return run();
    }
  }

  getActiveEditor() {
    return this.application.editorGroup.editors[0];
  }

  getEditors() {
    return this.application.editorGroup.editors;
  }

  closeEditor(editor: Editor) {
    this.application.editorGroup.closeEditor(editor);
  }

  closeActiveEditor() {
    this.application.editorGroup.closeActiveEditor();
  }

  closeAllEditors() {
    this.application.editorGroup.closeAllEditors();
  }

  editorForNote(note: SNNote) {
    for (const editor of this.getEditors()) {
      if (editor.note.uuid === note.uuid) {
        return editor;
      }
    }
  }

  streamNotesAndTags() {
    this.application!.streamItems(
      [ContentType.Note, ContentType.Tag],
      async (items, source) => {
        /** Close any editors for deleted/trashed/archived notes */
        if (source === PayloadSource.PreSyncSave) {
          const notes = items.filter((candidate) =>
            candidate.content_type === ContentType.Note
          ) as SNNote[];
          for (const note of notes) {
            const editor = this.editorForNote(note);
            if (!editor) {
              continue;
            }
            if (note.deleted) {
              this.closeEditor(editor);
            } else if (note.trashed && !this.selectedTag?.isTrashTag) {
              this.closeEditor(editor);
            } else if (note.archived && !this.selectedTag?.isArchiveTag) {
              this.closeEditor(editor);
            }
          }
        }
        if (this.selectedTag) {
          const matchingTag = items.find((candidate) => candidate.uuid === this.selectedTag!.uuid);
          if (matchingTag) {
            this.selectedTag = matchingTag as SNTag;
          }
        }
      }
    );
  }

  addAppEventObserver() {
    this.unsubApp = this.application.addEventObserver(async (eventName) => {
      switch (eventName) {
        case ApplicationEvent.Started:
          this.locked = true;
          break;
        case ApplicationEvent.Launched:
          this.locked = false;
          break;
        case ApplicationEvent.SyncStatusChanged:
          this.sync.update(this.application.getSyncStatus());
          break;
      }
    });
  }

  isLocked() {
    return this.locked;
  }

  registerVisibilityObservers() {
    if (isDesktopApplication()) {
      this.rootScopeCleanup1 = this.$rootScope.$on('window-lost-focus', () => {
        this.notifyEvent(AppStateEvent.WindowDidBlur);
      });
      this.rootScopeCleanup2 = this.$rootScope.$on('window-gained-focus', () => {
        this.notifyEvent(AppStateEvent.WindowDidFocus);
      });
    } else {
      /* Tab visibility listener, web only */
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  /** @returns  A function that unregisters this observer */
  addObserver(callback: ObserverCallback) {
    this.observers.push(callback);
    return () => {
      pull(this.observers, callback);
    };
  }

  async notifyEvent(eventName: AppStateEvent, data?: any) {
    /**
     * Timeout is particullary important so we can give all initial
     * controllers a chance to construct before propogting any events *
     */
    return new Promise((resolve) => {
      this.$timeout(async () => {
        for (const callback of this.observers) {
          await callback(eventName, data);
        }
        resolve();
      });
    });
  }

  setSelectedTag(tag: SNTag) {
    if (this.selectedTag === tag) {
      return;
    }
    const previousTag = this.selectedTag;
    this.selectedTag = tag;
    this.notifyEvent(
      AppStateEvent.TagChanged,
      {
        tag: tag,
        previousTag: previousTag
      }
    );
  }

  /** Returns the tags that are referncing this note */
  public getNoteTags(note: SNNote) {
    return this.application.referencingForItem(note).filter((ref) => {
      return ref.content_type === ContentType.Tag;
    }) as SNTag[]
  }

  public getSelectedTag() {
    return this.selectedTag;
  }

  setUserPreferences(preferences: SNUserPrefs) {
    this.userPreferences = preferences;
    this.notifyEvent(
      AppStateEvent.PreferencesChanged
    );
  }

  panelDidResize(name: string, collapsed: boolean) {
    this.notifyEvent(
      AppStateEvent.PanelResized,
      {
        panel: name,
        collapsed: collapsed
      }
    );
  }

  editorDidFocus(eventSource: EventSource) {
    this.notifyEvent(
      AppStateEvent.EditorFocused,
      { eventSource: eventSource }
    );
  }

  beganBackupDownload() {
    this.notifyEvent(
      AppStateEvent.BeganBackupDownload
    );
  }

  endedBackupDownload(success: boolean) {
    this.notifyEvent(
      AppStateEvent.EndedBackupDownload,
      { success: success }
    );
  }
}
