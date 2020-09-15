import { ApplicationGroup } from '@/ui_models/application_group';
import { FooterStatus, WebDirective } from '@/types';
import { dateToLocalizedString, preventRefreshing } from '@/utils';
import {
  ApplicationEvent,
  SyncQueueStrategy,
  ProtectedAction,
  ContentType,
  SNComponent,
  SNTheme,
  ComponentArea,
  ComponentAction,
  topLevelCompare,
  CollectionSort,
  ComponentMutator
} from 'snjs';
import template from './footer-view.pug';
import { AppStateEvent, EventSource } from '@/ui_models/app_state';
import {
  STRING_GENERIC_SYNC_ERROR,
  STRING_NEW_UPDATE_READY,
  STRING_CONFIRM_APP_QUIT_DURING_UPGRADE
} from '@/strings';
import { PureViewCtrl } from '@Views/abstract/pure_view_ctrl';

/**
 * Disable before production release.
 * Anyone who used the beta will still have access to
 * the account switcher in production via local storage flag
 */
const ACCOUNT_SWITCHER_ENABLED = true;
const ACCOUNT_SWITCHER_FEATURE_KEY = 'account_switcher';

type DockShortcut = {
  name: string,
  component: SNComponent,
  icon: {
    type: string
    background_color: string
    border_color: string
  }
}

class FooterViewCtrl extends PureViewCtrl<{}, {
  outOfSync: boolean;
  hasPasscode: boolean;
  dataUpgradeAvailable: boolean;
  dockShortcuts: DockShortcut[];
  hasAccountSwitcher: boolean
}> {
  private $rootScope: ng.IRootScopeService
  private rooms: SNComponent[] = []
  private themesWithIcons: SNTheme[] = []
  private showSyncResolution = false
  private unregisterComponent: any
  private rootScopeListener1: any
  private rootScopeListener2: any
  public arbitraryStatusMessage?: string
  public user?: any
  private backupStatus?: FooterStatus
  private offline = true
  private showAccountMenu = false
  private didCheckForOffline = false
  private queueExtReload = false
  private reloadInProgress = false
  public hasError = false
  public isRefreshing = false
  public lastSyncDate?: string
  public newUpdateAvailable = false
  public dockShortcuts: DockShortcut[] = []
  public roomShowState: Partial<Record<string, boolean>> = {}
  private observerRemovers: Array<() => void> = [];

  /* @ngInject */
  constructor(
    $rootScope: ng.IRootScopeService,
    $timeout: ng.ITimeoutService,
    private mainApplicationGroup: ApplicationGroup
  ) {
    super($timeout);
    this.$rootScope = $rootScope;
    this.addRootScopeListeners();
    this.toggleSyncResolutionMenu = this.toggleSyncResolutionMenu.bind(this);
    this.closeAccountMenu = this.closeAccountMenu.bind(this);
  }

  deinit() {
    for (const remove of this.observerRemovers) remove();
    this.observerRemovers.length = 0;
    this.rooms.length = 0;
    this.themesWithIcons.length = 0;
    this.unregisterComponent();
    this.unregisterComponent = undefined;
    this.rootScopeListener1();
    this.rootScopeListener2();
    this.rootScopeListener1 = undefined;
    this.rootScopeListener2 = undefined;
    (this.closeAccountMenu as any) = undefined;
    (this.toggleSyncResolutionMenu as any) = undefined;
    super.deinit();
  }

  $onInit() {
    super.$onInit();
    this.application.getStatusService().addStatusObserver((string: string) => {
      this.$timeout(() => {
        this.arbitraryStatusMessage = string;
      });
    });
    this.loadAccountSwitcherState();
  }

  loadAccountSwitcherState() {
    const stringValue = localStorage.getItem(ACCOUNT_SWITCHER_FEATURE_KEY);
    if (!stringValue && ACCOUNT_SWITCHER_ENABLED) {
      /** Enable permanently for this user so they don't lose the feature after its disabled */
      localStorage.setItem(ACCOUNT_SWITCHER_FEATURE_KEY, JSON.stringify(true));
    }
    const hasAccountSwitcher = stringValue ? JSON.parse(stringValue) : ACCOUNT_SWITCHER_ENABLED;
    this.setState({ hasAccountSwitcher });
  }

  getInitialState() {
    return {
      outOfSync: false,
      dataUpgradeAvailable: false,
      hasPasscode: false,
      dockShortcuts: [],
      descriptors: this.mainApplicationGroup.getDescriptors(),
      hasAccountSwitcher: false
    };
  }

  reloadUpgradeStatus() {
    this.application.checkForSecurityUpdate().then((available) => {
      this.setState({
        dataUpgradeAvailable: available
      });
    });
  }

  /** @template */
  openAccountSwitcher() {
    this.application.openAccountSwitcher();
  }

  async onAppLaunch() {
    super.onAppLaunch();
    this.reloadPasscodeStatus();
    this.reloadUser();
    this.reloadUpgradeStatus();
    this.updateOfflineStatus();
    this.findErrors();
    this.streamItems();
    this.registerComponentHandler();
  }

  reloadUser() {
    this.user = this.application.getUser();
  }

  async reloadPasscodeStatus() {
    const hasPasscode = this.application.hasPasscode();
    this.setState({
      hasPasscode: hasPasscode
    });
  }

  addRootScopeListeners() {
    this.rootScopeListener1 = this.$rootScope.$on("reload-ext-data", () => {
      this.reloadExtendedData();
    });
    this.rootScopeListener2 = this.$rootScope.$on("new-update-available", () => {
      this.$timeout(() => {
        this.onNewUpdateAvailable();
      });
    });
  }

  /** @override */
  onAppStateEvent(eventName: AppStateEvent, data: any) {
    if (eventName === AppStateEvent.EditorFocused) {
      if (data.eventSource === EventSource.UserInteraction) {
        this.closeAllRooms();
        this.closeAccountMenu();
      }
    } else if (eventName === AppStateEvent.BeganBackupDownload) {
      this.backupStatus = this.application.getStatusService().addStatusFromString(
        "Saving local backup..."
      );
    } else if (eventName === AppStateEvent.EndedBackupDownload) {
      if (data.success) {
        this.backupStatus = this.application.getStatusService().replaceStatusWithString(
          this.backupStatus!,
          "Successfully saved backup."
        );
      } else {
        this.backupStatus = this.application.getStatusService().replaceStatusWithString(
          this.backupStatus!,
          "Unable to save local backup."
        );
      }
      this.$timeout(() => {
        this.backupStatus = this.application.getStatusService().removeStatus(this.backupStatus!);
      }, 2000);
    }
  }

  /** @override */
  async onAppKeyChange() {
    super.onAppKeyChange();
    this.reloadPasscodeStatus();
  }

  /** @override */
  onAppEvent(eventName: ApplicationEvent) {
    if (eventName === ApplicationEvent.KeyStatusChanged) {
      this.reloadUpgradeStatus();
    } else if (eventName === ApplicationEvent.EnteredOutOfSync) {
      this.setState({
        outOfSync: true
      });
    } else if (eventName === ApplicationEvent.ExitedOutOfSync) {
      this.setState({
        outOfSync: false
      });
    } else if (eventName === ApplicationEvent.CompletedFullSync) {
      if (!this.didCheckForOffline) {
        this.didCheckForOffline = true;
        if (this.offline && this.application.getNoteCount() === 0) {
          this.showAccountMenu = true;
        }
      }
      this.syncUpdated();
      this.findErrors();
      this.updateOfflineStatus();
    } else if (eventName === ApplicationEvent.FailedSync) {
      this.findErrors();
      this.updateOfflineStatus();
    } else if (
      eventName === ApplicationEvent.SignedIn ||
      eventName === ApplicationEvent.SignedOut
    ) {
      this.reloadUser();
    }
  }

  streamItems() {
    this.application.setDisplayOptions(
      ContentType.Theme,
      CollectionSort.Title,
      'asc',
      (theme: SNTheme) => {
        return (
          theme.package_info &&
          theme.package_info.dock_icon
        );
      }
    )

    this.observerRemovers.push(this.application.streamItems(
      ContentType.Component,
      async () => {
        const components = this.application.getItems(ContentType.Component) as SNComponent[];
        this.rooms = components.filter((candidate) => {
          return candidate.area === ComponentArea.Rooms && !candidate.deleted;
        });
        if (this.queueExtReload) {
          this.queueExtReload = false;
          this.reloadExtendedData();
        }
      }
    ));

    this.observerRemovers.push(this.application.streamItems(
      ContentType.Theme,
      async () => {
        const themes = this.application.getDisplayableItems(ContentType.Theme) as SNTheme[];
        this.themesWithIcons = themes;
        this.reloadDockShortcuts();
      }
    ));
  }

  registerComponentHandler() {
    this.unregisterComponent = this.application.componentManager!.registerHandler({
      identifier: 'room-bar',
      areas: [ComponentArea.Rooms, ComponentArea.Modal],
      actionHandler: (component, action, data) => {
        if (action === ComponentAction.SetSize) {
          /** Do comparison to avoid repetitive calls by arbitrary component */
          if (!topLevelCompare(component.getLastSize(), data)) {
            this.application.changeItem<ComponentMutator>(component.uuid, (mutator) => {
              mutator.setLastSize(data);
            })
          }
        }
      },
      focusHandler: (component, focused) => {
        if (component.isEditor() && focused) {
          this.closeAllRooms();
          this.closeAccountMenu();
        }
      }
    });
  }

  reloadExtendedData() {
    if (this.reloadInProgress) {
      return;
    }
    this.reloadInProgress = true;

    /**
     * A reload consists of opening the extensions manager,
     * then closing it after a short delay.
     */
    const extWindow = this.rooms.find((room) => {
      return room.package_info.identifier === this.application
        .getNativeExtService().extManagerId;
    });
    if (!extWindow) {
      this.queueExtReload = true;
      this.reloadInProgress = false;
      return;
    }
    this.selectRoom(extWindow);
    this.$timeout(() => {
      this.selectRoom(extWindow);
      this.reloadInProgress = false;
      this.$rootScope.$broadcast('ext-reload-complete');
    }, 2000);
  }

  updateOfflineStatus() {
    this.offline = this.application.noAccount();
  }

  async openSecurityUpdate() {
    preventRefreshing(STRING_CONFIRM_APP_QUIT_DURING_UPGRADE, async () => {
      await this.application.performProtocolUpgrade();
    });
  }

  findErrors() {
    this.hasError = this.application.getSyncStatus().hasError();
  }

  accountMenuPressed() {
    this.showAccountMenu = !this.showAccountMenu;
    this.closeAllRooms();
  }

  toggleSyncResolutionMenu() {
    this.showSyncResolution = !this.showSyncResolution;
  }

  closeAccountMenu() {
    this.showAccountMenu = false;
  }

  lockApp() {
    this.application.lock();
  }

  refreshData() {
    this.isRefreshing = true;
    this.application.sync({
      queueStrategy: SyncQueueStrategy.ForceSpawnNew,
      checkIntegrity: true
    }).then((response) => {
      this.$timeout(() => {
        this.isRefreshing = false;
      }, 200);
      if (response && response.error) {
        this.application.alertService!.alert(
          STRING_GENERIC_SYNC_ERROR
        );
      } else {
        this.syncUpdated();
      }
    });
  }

  syncUpdated() {
    this.lastSyncDate = dateToLocalizedString(this.application.getLastSyncDate()!);
  }

  onNewUpdateAvailable() {
    this.newUpdateAvailable = true;
  }

  clickedNewUpdateAnnouncement() {
    this.newUpdateAvailable = false;
    this.application.alertService!.alert(
      STRING_NEW_UPDATE_READY
    );
  }

  reloadDockShortcuts() {
    const shortcuts = [];
    for (const theme of this.themesWithIcons) {
      const name = theme.package_info.name;
      const icon = theme.package_info.dock_icon;
      if (!icon) {
        continue;
      }
      shortcuts.push({
        name: name,
        component: theme,
        icon: icon
      } as DockShortcut);
    }
    this.setState({
      dockShortcuts: shortcuts.sort((a, b) => {
        /** Circles first, then images */
        const aType = a.icon.type;
        const bType = b.icon.type;
        if (aType === 'circle' && bType === 'svg') {
          return -1;
        } else if (bType === 'circle' && aType === 'svg') {
          return 1;
        } else {
          return a.name.localeCompare(b.name);
        }
      })
    });
  }

  initSvgForShortcut(shortcut: DockShortcut) {
    const id = 'dock-svg-' + shortcut.component.uuid;
    const element = document.getElementById(id)!;
    const parser = new DOMParser();
    const svg = shortcut.component.package_info.dock_icon.source;
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    element.appendChild(doc.documentElement);
  }

  selectShortcut(shortcut: DockShortcut) {
    this.application.toggleComponent(shortcut.component);
  }

  onRoomDismiss(room: SNComponent) {
    this.roomShowState[room.uuid] = false;
  }

  closeAllRooms() {
    for (const room of this.rooms) {
      this.roomShowState[room.uuid] = false;
    }
  }

  async selectRoom(room: SNComponent) {
    const run = () => {
      this.$timeout(() => {
        this.roomShowState[room.uuid] = !this.roomShowState[room.uuid];
      });
    };

    if (!this.roomShowState[room.uuid]) {
      const requiresPrivilege = await this.application.privilegesService!
        .actionRequiresPrivilege(
          ProtectedAction.ManageExtensions
        );
      if (requiresPrivilege) {
        this.application.presentPrivilegesModal(
          ProtectedAction.ManageExtensions,
          run
        );
      } else {
        run();
      }
    } else {
      run();
    }
  }

  clickOutsideAccountMenu() {
    if (this.application && this.application.authenticationInProgress()) {
      return;
    }
    this.showAccountMenu = false;
  }
}

export class FooterView extends WebDirective {
  constructor() {
    super();
    this.restrict = 'E';
    this.template = template;
    this.controller = FooterViewCtrl;
    this.replace = true;
    this.controllerAs = 'ctrl';
    this.bindToController = true;
    this.scope = {
      application: '='
    };
  }
}
