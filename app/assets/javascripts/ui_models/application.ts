import { ComponentModalScope } from './../directives/views/componentModal';
import { AccountSwitcherScope, PermissionsModalScope } from './../types';
import { ComponentGroup } from './component_group';
import { EditorGroup } from '@/ui_models/editor_group';
import { InputModalScope } from '@/directives/views/inputModal';
import { PasswordWizardType, PasswordWizardScope } from '@/types';
import {
  SNApplication,
  platformFromString,
  SNComponent,
  PermissionDialog,
  DeinitSource,
} from '@standardnotes/snjs';
import angular from 'angular';
import { getPlatform, getPlatformString } from '@/utils';
import { AlertService } from '@/services/alertService';
import { WebDeviceInterface } from '@/web_device_interface';
import {
  DesktopManager,
  AutolockService,
  ArchiveManager,
  NativeExtManager,
  StatusManager,
  ThemeManager,
  KeyboardManager
} from '@/services';
import { AppState } from '@/ui_models/app_state';
import { Bridge } from '@/services/bridge';
import { WebCrypto } from '@/crypto';

type WebServices = {
  appState: AppState;
  desktopService: DesktopManager;
  autolockService: AutolockService;
  archiveService: ArchiveManager;
  nativeExtService: NativeExtManager;
  statusManager: StatusManager;
  themeService: ThemeManager;
  keyboardService: KeyboardManager;
}

export class WebApplication extends SNApplication {

  private scope?: angular.IScope
  private webServices!: WebServices
  private currentAuthenticationElement?: angular.IRootElementService
  public editorGroup: EditorGroup
  public componentGroup: ComponentGroup

  /* @ngInject */
  constructor(
    deviceInterface: WebDeviceInterface,
    identifier: string,
    private $compile: angular.ICompileService,
    scope: angular.IScope,
    defaultSyncServerHost: string,
    private bridge: Bridge,
  ) {
    super(
      bridge.environment,
      getPlatform(),
      deviceInterface,
      WebCrypto,
      new AlertService(),
      identifier,
      undefined,
      undefined,
      defaultSyncServerHost
    );
    this.$compile = $compile;
    this.scope = scope;
    deviceInterface.setApplication(this);
    this.editorGroup = new EditorGroup(this);
    this.componentGroup = new ComponentGroup(this);
    this.openModalComponent = this.openModalComponent.bind(this);
    this.presentPermissionsDialog = this.presentPermissionsDialog.bind(this);
  }

  /** @override */
  deinit(source: DeinitSource): void {
    for (const service of Object.values(this.webServices)) {
      if ('deinit' in service) {
        service.deinit?.(source);
      }
      (service as any).application = undefined;
    }
    this.webServices = {} as WebServices;
    (this.$compile as any) = undefined;
    this.editorGroup.deinit();
    this.componentGroup.deinit();
    (this.scope! as any).application = undefined;
    this.scope!.$destroy();
    this.scope = undefined;
    (this.openModalComponent as any) = undefined;
    (this.presentPermissionsDialog as any) = undefined;
    /** Allow our Angular directives to be destroyed and any pending digest cycles
     * to complete before destroying the global application instance and all its services */
    setTimeout(() => {
      super.deinit(source);
    }, 0);
  }

  onStart(): void {
    super.onStart();
    this.componentManager!.openModalComponent = this.openModalComponent;
    this.componentManager!.presentPermissionsDialog = this.presentPermissionsDialog;
  }

  setWebServices(services: WebServices): void {
    this.webServices = services;
  }

  public getAppState(): AppState {
    return this.webServices.appState;
  }

  public getDesktopService(): DesktopManager {
    return this.webServices.desktopService;
  }

  public getAutolockService() {
    return this.webServices.autolockService;
  }

  public getArchiveService() {
    return this.webServices.archiveService;
  }

  public getNativeExtService() {
    return this.webServices.nativeExtService;
  }

  getStatusManager() {
    return this.webServices.statusManager;
  }

  public getThemeService() {
    return this.webServices.themeService;
  }

  public getKeyboardService() {
    return this.webServices.keyboardService;
  }

  async checkForSecurityUpdate() {
    return this.protocolUpgradeAvailable();
  }

  presentPasswordWizard(type: PasswordWizardType) {
    this.bridge.downloadBackup();
    const scope = this.scope!.$new(true) as PasswordWizardScope;
    scope.type = type;
    scope.application = this;
    const el = this.$compile!(
      "<password-wizard application='application' type='type'></password-wizard>"
    )(scope as any);
    this.applicationElement.append(el);
  }

  authenticationInProgress() {
    return this.currentAuthenticationElement != null;
  }

  get applicationElement() {
    return angular.element(document.getElementById(this.identifier)!);
  }

  presentPasswordModal(callback: () => void) {
    const scope = this.scope!.$new(true) as InputModalScope;
    scope.type = "password";
    scope.title = "Decryption Assistance";
    scope.message = `Unable to decrypt this item with your current keys.
                     Please enter your account password at the time of this revision.`;
    scope.callback = callback;
    const el = this.$compile!(
      `<input-modal type='type' message='message'
     title='title' callback='callback()'></input-modal>`
    )(scope as any);
    this.applicationElement.append(el);
  }

  presentRevisionPreviewModal(uuid: string, content: any) {
    const scope: any = this.scope!.$new(true);
    scope.uuid = uuid;
    scope.content = content;
    scope.application = this;
    const el = this.$compile!(
      `<revision-preview-modal application='application' uuid='uuid' content='content'
      class='sk-modal'></revision-preview-modal>`
    )(scope);
    this.applicationElement.append(el);
  }

  public openAccountSwitcher() {
    const scope = this.scope!.$new(true) as Partial<AccountSwitcherScope>;
    scope.application = this;
    const el = this.$compile!(
      "<account-switcher application='application' "
      + "class='sk-modal'></account-switcher>"
    )(scope as any);
    this.applicationElement.append(el);
  }

  async openModalComponent(component: SNComponent): Promise<void> {
    if (component.package_info?.identifier === "org.standardnotes.batch-manager") {
      if (!await this.authorizeBatchManagerAccess()) {
        return;
      }
    }
    const scope = this.scope!.$new(true) as Partial<ComponentModalScope>;
    scope.componentUuid = component.uuid;
    scope.application = this;
    const el = this.$compile!(
      "<component-modal application='application' component-uuid='componentUuid' "
      + "class='sk-modal'></component-modal>"
    )(scope as any);
    this.applicationElement.append(el);
  }

  presentPermissionsDialog(dialog: PermissionDialog) {
    const scope = this.scope!.$new(true) as PermissionsModalScope;
    scope.permissionsString = dialog.permissionsString;
    scope.component = dialog.component;
    scope.callback = dialog.callback;
    const el = this.$compile!(
      "<permissions-modal component='component' permissions-string='permissionsString'"
      + " callback='callback' class='sk-modal'></permissions-modal>"
    )(scope as any);
    this.applicationElement.append(el);
  }
}
