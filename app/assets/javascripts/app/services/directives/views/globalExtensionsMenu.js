class GlobalExtensionsMenu {

  constructor() {
    this.restrict = "E";
    this.templateUrl = "frontend/directives/global-extensions-menu.html";
    this.scope = {
    };
  }

  controller($scope, extensionManager, syncManager, modelManager, themeManager, componentManager) {
    'ngInject';

    $scope.formData = {};

    $scope.extensionManager = extensionManager;
    $scope.themeManager = themeManager;
    $scope.componentManager = componentManager;

    $scope.serverExtensions = modelManager.itemsForContentType("SF|Extension");

    $scope.selectedAction = function(action, extension) {
      extensionManager.executeAction(action, extension, null, function(response){
        if(response && response.error) {
          action.error = true;
          alert("There was an error performing this action. Please try again.");
        } else {
          action.error = false;
          syncManager.sync(null);
        }
      })
    }

    $scope.changeExtensionEncryptionFormat = function(encrypted, extension) {
      extension.encrypted = encrypted;
      extension.setDirty(true);
      syncManager.sync();
    }

    $scope.deleteActionExtension = function(extension) {
      if(confirm("Are you sure you want to delete this extension?")) {
        extensionManager.deleteExtension(extension);
      }
    }

    $scope.reloadExtensionsPressed = function() {
      if(confirm("For your security, reloading extensions will disable any currently enabled repeat actions.")) {
        extensionManager.refreshExtensionsFromServer();
      }
    }

    $scope.deleteTheme = function(theme) {
      if(confirm("Are you sure you want to delete this theme?")) {
        themeManager.deactivateTheme(theme);
        modelManager.setItemToBeDeleted(theme);
        syncManager.sync();
      }
    }

    $scope.renameExtension = function(extension) {
      extension.tempName = extension.name;
      extension.rename = true;
    }

    $scope.submitExtensionRename = function(extension) {
      extension.name = extension.tempName;
      extension.tempName = null;
      extension.setDirty(true);
      extension.rename = false;
      syncManager.sync();
    }

    $scope.clickedExtension = function(extension) {
      if(extension.rename) {
        return;
      }

      if($scope.currentlyExpandedExtension && $scope.currentlyExpandedExtension !== extension) {
        $scope.currentlyExpandedExtension.showDetails = false;
        $scope.currentlyExpandedExtension.rename = false;
      }

      extension.showDetails = !extension.showDetails;

      if(extension.showDetails) {
        $scope.currentlyExpandedExtension = extension;
      }
    }

    // Server extensions

    $scope.deleteServerExt = function(ext) {
      if(confirm("Are you sure you want to delete and disable this extension?")) {
        _.remove($scope.serverExtensions, {uuid: ext.uuid});
        modelManager.setItemToBeDeleted(ext);
        syncManager.sync();
      }
    }

    $scope.nameForServerExtension = function(ext) {
      var url = ext.url;
      if(!url) {
        return "Invalid Extension";
      }
      if(url.includes("gdrive")) {
        return "Google Drive Sync";
      } else if(url.includes("file_attacher")) {
        return "File Attacher";
      } else if(url.includes("onedrive")) {
        return "OneDrive Sync";
      } else if(url.includes("backup.email_archive")) {
        return "Daily Email Backups";
      } else if(url.includes("dropbox")) {
        return "Dropbox Sync";
      } else if(url.includes("revisions")) {
        return "Revision History";
      } else {
        return null;
      }
    }


    // Components

    $scope.revokePermissions = function(component) {
      component.permissions = [];
      component.setDirty(true);
      syncManager.sync();
    }

    $scope.deleteComponent = function(component) {
      if(confirm("Are you sure you want to delete this component?")) {
        componentManager.deleteComponent(component);
      }
    }

    $scope.makeEditorDefault = function(component) {
      var currentDefault = componentManager.componentsForArea("editor-editor").filter((e) => {return e.isDefaultEditor()})[0];
      if(currentDefault) {
        currentDefault.setAppDataItem("defaultEditor", false);
        currentDefault.setDirty(true);
      }
      component.setAppDataItem("defaultEditor", true);
      component.setDirty(true);
      syncManager.sync();
    }

    $scope.removeEditorDefault = function(component) {
      component.setAppDataItem("defaultEditor", false);
      component.setDirty(true);
      syncManager.sync();
    }

    // Installation

    $scope.submitInstallLink = function() {

      var fullLink = $scope.formData.installLink;
      if(!fullLink) {
        return;
      }

      var completion = function() {
        $scope.formData.installLink = "";
        $scope.formData.successfullyInstalled = true;
      }

      var links = fullLink.split(",");
      for(var link of links) {
        var type = getParameterByName("type", link);

        if(type == "sf") {
          $scope.handleSyncAdapterLink(link, completion);
        } else if(link.indexOf(".css") != -1 || type == "theme") {
          $scope.handleThemeLink(link, completion);
        } else if(type == "component") {
          $scope.handleComponentLink(link, completion);
        }

        else {
          $scope.handleActionLink(link, completion);
        }
      }
    }

    $scope.handleSyncAdapterLink = function(link, completion) {
      var params = parametersFromURL(link);
      params["url"] = link;
      var ext = new SyncAdapter({content: params});
      ext.setDirty(true);

      modelManager.addItem(ext);
      syncManager.sync();
      $scope.serverExtensions.push(ext);
      completion();
    }

    $scope.handleThemeLink = function(link, completion) {
      themeManager.submitTheme(link);
      completion();
    }

    $scope.handleComponentLink = function(link, completion) {
      componentManager.installComponent(link);
      completion();
    }

    $scope.handleActionLink = function(link, completion) {
      if(link) {
        extensionManager.addExtension(link, function(response){
          if(!response) {
            alert("Unable to register this extension. Make sure the link is valid and try again.");
          } else {
            completion();
          }
        })
      }
    }

  }

}

angular.module('app.frontend').directive('globalExtensionsMenu', () => new GlobalExtensionsMenu);
