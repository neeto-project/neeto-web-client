class ExtensionManager {

  constructor(Restangular, modelManager, authManager, syncManager) {
      this.Restangular = Restangular;
      this.modelManager = modelManager;
      this.authManager = authManager;
      this.enabledRepeatActionUrls = JSON.parse(localStorage.getItem("enabledRepeatActionUrls")) || [];
      this.decryptedExtensions = JSON.parse(localStorage.getItem("decryptedExtensions")) || [];
      this.syncManager = syncManager;

      modelManager.addItemSyncObserver("extensionManager", "SN|Extension", function(items){
        for (var ext of items) {

          ext.encrypted = this.extensionUsesEncryptedData(ext);

          for (var action of ext.actions) {
            if(_.includes(this.enabledRepeatActionUrls, action.url)) {
              this.enableRepeatAction(action, ext);
            }
          }
        }
      }.bind(this))
  }

  get extensions() {
    return this.modelManager.extensions;
  }

  appExtensionsInContextOfItem(item) {
    return this.extensions.filter(function(ext){
      return _.includes(["Extension", "SN|Extension"], ext.content_type) && (_.includes(ext.supported_types, item.content_type) || ext.actionsWithContextForItem(item).length > 0);
    })
  }

  actionWithURL(url) {
    for (var extension of this.extensions) {
      return _.find(extension.actions, {url: url})
    }
  }

  extensionUsesEncryptedData(extension) {
    return !_.includes(this.decryptedExtensions, extension.url);
  }

  changeExtensionEncryptionFormat(encrypted, extension) {
    if(encrypted) {
      _.pull(this.decryptedExtensions, extension.url);
    } else {
      this.decryptedExtensions.push(extension.url);
    }

    localStorage.setItem("decryptedExtensions", JSON.stringify(this.decryptedExtensions))

    extension.encrypted = this.extensionUsesEncryptedData(extension);
  }

  addExtension(url, callback) {

    function allExtensionsFromURL(allUrl) {
      var all = [];
      var type = "SN|Extension";
      var name = null;

      var appPayload = Neeto.util.getParameterByName("ap", allUrl);
      if(appPayload) {
        var json = window.atob(appPayload);
        var payload = JSON.parse(json);
        type = payload["type"];
        name = payload["name"];
        if(payload["deps"]) {
          // dependencies
          var depUrls = payload["deps"];
          for(var depUrl of depUrls) {
            all = all.concat(allExtensionsFromURL(depUrl));
          }
        }
      }

      all.push({type: type, url: allUrl, name: name})

      return all;
    }

    var extensionsParams = allExtensionsFromURL(url);

    for(var extParams of extensionsParams) {
      if(extParams.type == "SN|Editor") {
        var editor = this.modelManager.createItem({
          content_type: "SN|Editor",
          url: extParams.url,
          name: extParams.name
        });
        editor.setDirty(true);
        this.modelManager.addItem(editor);
        this.syncManager.sync();
      } else if(extParams.type == "SF|Extension") {
        var item = this.modelManager.createItem({
          content_type: "SF|Extension",
          url: extParams.url,
          name: extParams.name
        });
        item.setDirty(true);
        this.modelManager.addItem(item);
        this.syncManager.sync();
      } else if(extParams.type == "SN|Extension") {
        this.retrieveExtensionDetailsFromServer(extParams.url, callback);
      }
    }
  }

  deleteExtension(extension) {
    if(extension.actions) {
      for(var action of extension.actions) {
        _.pull(this.decryptedExtensions, extension);
        if(action.repeat_mode) {
          if(this.isRepeatActionEnabled(action)) {
            this.disableRepeatAction(action);
          }
        }
      }
    }

    this.modelManager.setItemToBeDeleted(extension);
    this.syncManager.sync(null);
  }

  /*
  Loads an extension in the context of a certain item. The server then has the chance to respond with actions that are
  relevant just to this item. The response extension is not saved, just displayed as a one-time thing.
  */
  loadExtensionInContextOfItem(extension, item, callback) {
    this.Restangular.oneUrl(extension.url, extension.url).customGET("", {content_type: item.content_type, item_uuid: item.uuid}).then(function(response){
      var scopedExtension = new AppExtension(response.plain());
      callback(scopedExtension);
    }.bind(this))
    .catch(function(response){
      console.log("Error loading extension", response);
      callback(null);
    })
  }

  /*
  Registers new extension and saves it to user's account
  */
  retrieveExtensionDetailsFromServer(url, callback) {
    this.Restangular.oneUrl(url, url).get().then(function(response){
      var ext = this.handleExtensionLoadExternalResponseItem(url, response.plain());
      if(callback) {
        callback(ext);
      }
    }.bind(this))
    .catch(function(response){
      console.log("Error registering extension", response);
      callback(null);
    })
  }

  handleExtensionLoadExternalResponseItem(url, externalResponseItem) {
    var extension = _.find(this.extensions, {url: url});
    if(extension) {
      extension.updateFromExternalResponseItem(externalResponseItem);
    } else {
      extension = new AppExtension(externalResponseItem);
      extension.url = url;
      extension.setDirty(true);
      this.modelManager.addItem(extension);
      this.syncManager.sync(null);
    }

    return extension;
  }

  refreshExtensionsFromServer() {
    for (var url of this.enabledRepeatActionUrls) {
      var action = this.actionWithURL(url);
      if(action) {
        this.disableRepeatAction(action);
      }
    }

    for(var ext of this.extensions) {
      this.retrieveExtensionDetailsFromServer(ext.url, function(extension){
        extension.setDirty(true);
      });
    }
  }

  executeAction(action, extension, item, callback) {

    if(this.extensionUsesEncryptedData(extension) && this.authManager.offline()) {
      alert("To send data encrypted, you must have an encryption key, and must therefore be signed in.");
      callback(null);
      return;
    }

    var customCallback = function(response) {
      action.running = false;
      callback(response);
    }

    action.running = true;

    switch (action.verb) {
      case "get": {
        this.Restangular.oneUrl(action.url, action.url).get().then(function(response){
          action.error = false;
          var items = response.items || [response.item];
          EncryptionHelper.decryptMultipleItems(items, localStorage.getItem("mk"));
          items = this.modelManager.mapResponseItemsToLocalModels(items);
          for(var item of items) {
            item.setDirty(true);
          }
          this.syncManager.sync(null);
          customCallback({items: items});
        }.bind(this))
        .catch(function(response){
          action.error = true;
          customCallback(null);
        })

        break;
      }

      case "render": {
        this.Restangular.oneUrl(action.url, action.url).get().then(function(response){
          action.error = false;
          EncryptionHelper.decryptItem(response.item, localStorage.getItem("mk"));
          var item = this.modelManager.createItem(response.item);
          customCallback({item: item});
        }.bind(this))
        .catch(function(response){
          action.error = true;
          customCallback(null);
        })

        break;
      }

      case "show": {
        var win = window.open(action.url, '_blank');
        win.focus();
        customCallback();
        break;
      }

      case "post": {
        var params = {};

        if(action.all) {
          var items = this.modelManager.allItemsMatchingTypes(action.content_types);
          params.items = items.map(function(item){
            var params = this.outgoingParamsForItem(item, extension);
            return params;
          }.bind(this))

        } else {
          params.items = [this.outgoingParamsForItem(item, extension)];
        }

        this.performPost(action, extension, params, function(response){
          customCallback(response);
        });

        break;
      }

      default: {

      }
    }

    action.lastExecuted = new Date();
  }

  isRepeatActionEnabled(action) {
    return _.includes(this.enabledRepeatActionUrls, action.url);
  }

  disableRepeatAction(action, extension) {
    _.pull(this.enabledRepeatActionUrls, action.url);
    localStorage.setItem("enabledRepeatActionUrls", JSON.stringify(this.enabledRepeatActionUrls));
    this.modelManager.removeItemChangeObserver(action.url);

    console.assert(this.isRepeatActionEnabled(action) == false);
  }

  enableRepeatAction(action, extension) {
    if(!_.find(this.enabledRepeatActionUrls, action.url)) {
      this.enabledRepeatActionUrls.push(action.url);
      localStorage.setItem("enabledRepeatActionUrls", JSON.stringify(this.enabledRepeatActionUrls));
    }

    if(action.repeat_mode) {

      if(action.repeat_mode == "watch") {
        this.modelManager.addItemChangeObserver(action.url, action.content_types, function(changedItems){
          this.triggerWatchAction(action, extension, changedItems);
        }.bind(this))
      }

      if(action.repeat_mode == "loop") {
        // todo
      }

    }
  }

  queueAction(action, extension, delay, changedItems) {
    this.actionQueue = this.actionQueue || [];
    if(_.find(this.actionQueue, {url: action.url})) {
      return;
    }

    // console.log("Successfully queued", action, this.actionQueue.length);
    this.actionQueue.push(action);

    setTimeout(function () {
      // console.log("Performing queued action", action);
      this.triggerWatchAction(action, extension, changedItems);
      _.pull(this.actionQueue, action);
    }.bind(this), delay * 1000);
  }

  triggerWatchAction(action, extension, changedItems) {
    if(action.repeat_timeout > 0) {
      var lastExecuted = action.lastExecuted;
      var diffInSeconds = (new Date() - lastExecuted)/1000;
      if(diffInSeconds < action.repeat_timeout) {
        var delay = action.repeat_timeout - diffInSeconds;
        this.queueAction(action, extension, delay, changedItems);
        return;
      }
    }

    action.lastExecuted = new Date();

    console.log("Performing action.");

    if(action.verb == "post") {
      var params = {};
      params.items = changedItems.map(function(item){
        var params = this.outgoingParamsForItem(item, extension);
        return params;
      }.bind(this))

      action.running = true;
      this.performPost(action, extension, params, function(){
        action.running = false;
      });
    } else {
      // todo
    }
  }

  outgoingParamsForItem(item, extension) {
    var ek = this.syncManager.masterKey;
    if(!this.extensionUsesEncryptedData(extension)) {
      ek = null;
    }
    var itemParams = new ItemParams(item, ek);
    return itemParams.paramsForExtension();
  }

  performPost(action, extension, params, callback) {
    var request = this.Restangular.oneUrl(action.url, action.url);
    if(this.extensionUsesEncryptedData(extension)) {
      request.auth_params = this.authManager.getAuthParams();
    }
    _.merge(request, params);

    request.post().then(function(response){
      action.error = false;
      if(callback) {
        callback(response.plain());
      }
    })
    .catch(function(response){
      action.error = true;
      console.log("Action error response:", response);
      if(callback) {
        callback({error: "Request error"});
      }
    })
  }

}

angular.module('app.frontend').service('extensionManager', ExtensionManager);
