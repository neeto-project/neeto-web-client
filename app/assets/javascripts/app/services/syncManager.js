class SyncManager {

  constructor($rootScope, modelManager, userManager, dbManager, httpManager, $interval, $timeout, storageManager, passcodeManager) {
    this.$rootScope = $rootScope;
    this.httpManager = httpManager;
    this.modelManager = modelManager;
    this.userManager = userManager;
    this.dbManager = dbManager;
    this.$interval = $interval;
    this.$timeout = $timeout;
    this.storageManager = storageManager;
    this.passcodeManager = passcodeManager;
    this.syncStatus = {};

    this.pendingSingletons = [];
    this.syncableSingletons = [];
  }

  get serverURL() {
    return this.storageManager.getItem("server") || window._default_sf_server;
  }

  get masterKey() {
    return this.storageManager.getItem("mk");
  }

  get serverPassword() {
    return this.storageManager.getItem("pw");
  }

  writeItemsToLocalStorage(items, offlineOnly, callback) {
    if(items.length == 0) {
      callback && callback();
      return;
    }
    // Use null to use the latest protocol version if offline
    var version = this.userManager.offline() ? null : this.userManager.protocolVersion();
    var keys = this.userManager.offline() ? this.passcodeManager.keys() : this.userManager.keys();
    var params = items.map(function(item) {
      var itemParams = new ItemParams(item, keys, version);
      itemParams = itemParams.paramsForLocalStorage();
      if(offlineOnly) {
        delete itemParams.dirty;
      }
      return itemParams;
    }.bind(this));

    this.storageManager.saveModels(params, callback);
  }

  loadLocalItems(callback) {
    var params = this.storageManager.getAllModels(function(items){
      var items = this.handleItemsResponse(items, null);
      Item.sortItemsByDate(items);
      callback(items);
    }.bind(this))
  }

  syncOffline(items, callback) {
    this.writeItemsToLocalStorage(items, true, function(responseItems){
      // delete anything needing to be deleted
      for(var item of items) {
        if(item.deleted) {
          this.modelManager.removeItemLocally(item);
        }
      }

      if(callback) {
        callback({success: true});
      }

      this.$rootScope.$broadcast("sync:completed");
    }.bind(this))

  }

  /*
    In the case of signing in and merging local data, we alternative UUIDs
    to avoid overwriting data a user may retrieve that has the same UUID.
    Alternating here forces us to to create duplicates of the items instead.
   */
  markAllItemsDirtyAndSaveOffline(callback, alternateUUIDs) {

    // use a copy, as alternating uuid will affect array
    var originalItems = this.modelManager.allItems.slice();

    var block = () => {
      var allItems = this.modelManager.allItems;
      for(var item of allItems) {
        item.setDirty(true);
      }
      this.writeItemsToLocalStorage(allItems, false, callback);
    }

    if(alternateUUIDs) {
      var index = 0;

      let alternateNextItem = () => {
        if(index >= originalItems.length) {
          // We don't use originalItems as altnerating UUID will have deleted them.
          block();
          return;
        }

        var item = originalItems[index];
        index++;

        // alternateUUIDForItem last param is a boolean that controls whether the original item
        // should be removed locally after new item is created. We set this to true, since during sign in,
        // all item ids are alternated, and we only want one final copy of the entire data set.
        // Passing false can be desired sometimes, when for example the app has signed out the user,
        // but for some reason retained their data (This happens in Firefox when using private mode).
        // In this case, we should pass false so that both copies are kept. However, it's difficult to
        // detect when the app has entered this state. We will just use true to remove original items for now.
        this.modelManager.alternateUUIDForItem(item, alternateNextItem, true);
      }

      alternateNextItem();
    } else {
      block();
    }
  }

  get syncURL() {
    return this.serverURL + "/items/sync";
  }

  set syncToken(token) {
    this._syncToken = token;
    this.storageManager.setItem("syncToken", token);
  }

  get syncToken() {
    if(!this._syncToken) {
      this._syncToken = this.storageManager.getItem("syncToken");
    }
    return this._syncToken;
  }

  set cursorToken(token) {
    this._cursorToken = token;
    if(token) {
      this.storageManager.setItem("cursorToken", token);
    } else {
      this.storageManager.removeItem("cursorToken");
    }
  }

  get cursorToken() {
    if(!this._cursorToken) {
      this._cursorToken = this.storageManager.getItem("cursorToken");
    }
    return this._cursorToken;
  }

  get queuedCallbacks() {
    if(!this._queuedCallbacks) {
      this._queuedCallbacks = [];
    }
    return this._queuedCallbacks;
  }

  clearQueuedCallbacks() {
    this._queuedCallbacks = [];
  }

  callQueuedCallbacksAndCurrent(currentCallback, response) {
    var allCallbacks = this.queuedCallbacks;
    if(currentCallback) {
      allCallbacks.push(currentCallback);
    }
    if(allCallbacks.length) {
      for(var eachCallback of allCallbacks) {
        eachCallback(response);
      }
      this.clearQueuedCallbacks();
    }
  }

  beginCheckingIfSyncIsTakingTooLong() {
    this.syncStatus.checker = this.$interval(function(){
      // check to see if the ongoing sync is taking too long, alert the user
      var secondsPassed = (new Date() - this.syncStatus.syncStart) / 1000;
      var warningThreshold = 5.0; // seconds
      if(secondsPassed > warningThreshold) {
        this.$rootScope.$broadcast("sync:taking-too-long");
        this.stopCheckingIfSyncIsTakingTooLong();
      }
    }.bind(this), 500)
  }

  stopCheckingIfSyncIsTakingTooLong() {
    this.$interval.cancel(this.syncStatus.checker);
  }

  sync(callback, options = {}) {

    var allDirtyItems = this.modelManager.getDirtyItems();

    if(this.syncStatus.syncOpInProgress) {
      this.repeatOnCompletion = true;
      if(callback) {
        this.queuedCallbacks.push(callback);
      }

      // write to local storage nonetheless, since some users may see several second delay in server response.
      // if they close the browser before the ongoing sync request completes, local changes will be lost if we dont save here
      this.writeItemsToLocalStorage(allDirtyItems, false, null);

      console.log("Sync op in progress; returning.");
      return;
    }

    // we want to write all dirty items to disk only if the user is offline, or if the sync op fails
    // if the sync op succeeds, these items will be written to disk by handling the "saved_items" response from the server
    if(this.userManager.offline()) {
      this.syncOffline(allDirtyItems, callback);
      this.modelManager.clearDirtyItems(allDirtyItems);
      return;
    }

    var isContinuationSync = this.syncStatus.needsMoreSync;

    this.syncStatus.syncOpInProgress = true;
    this.syncStatus.syncStart = new Date();
    this.beginCheckingIfSyncIsTakingTooLong();

    let submitLimit = 100;

    var subItems = allDirtyItems.filter((item) => {
      // for singleton items, we want to retrieve the latest information the server has before syncing,
      // to make sure we don't create more than one instance.
      var isSingleton = item.singleton();
      var syncable = _.includes(this.syncableSingletons, item);
      if(isSingleton && !syncable) {
        this.pendingSingletons.push(item);
        return false;
      }
      return true;
    }).slice(0, submitLimit);

    if(subItems.length < allDirtyItems.length - this.pendingSingletons.length) {
      // more items left to be synced, repeat
      this.syncStatus.needsMoreSync = true;
    } else {
      this.syncStatus.needsMoreSync = false;
    }

    if(!isContinuationSync) {
      this.syncStatus.total = allDirtyItems.length;
      this.syncStatus.current = 0;
    }

    // when doing a sync request that returns items greater than the limit, and thus subsequent syncs are required,
    // we want to keep track of all retreived items, then save to local storage only once all items have been retrieved,
    // so that relationships remain intact
    if(!this.allRetreivedItems) {
      this.allRetreivedItems = [];
    }

    var version = this.userManager.protocolVersion();
    var keys = this.userManager.keys();

    var params = {};
    params.limit = 150;
    params.items = _.map(subItems, function(item){
      var itemParams = new ItemParams(item, keys, version);
      itemParams.additionalFields = options.additionalFields;
      return itemParams.paramsForSync();
    }.bind(this));

    params.sync_token = this.syncToken;
    params.cursor_token = this.cursorToken;

    var onSyncCompletion = function(response) {
      this.stopCheckingIfSyncIsTakingTooLong();
    }.bind(this);

    var onSyncSuccess = function(response) {
      this.modelManager.clearDirtyItems(subItems);
      this.syncStatus.error = null;

      this.$rootScope.$broadcast("sync:updated_token", this.syncToken);

      // Map retrieved items to local data
      var retrieved
      = this.handleItemsResponse(response.retrieved_items, null);

      // Append items to master list of retrieved items for this ongoing sync operation
      this.allRetreivedItems = this.allRetreivedItems.concat(retrieved);

      // Merge only metadata for saved items
      // we write saved items to disk now because it clears their dirty status then saves
      // if we saved items before completion, we had have to save them as dirty and save them again on success as clean
      var omitFields = ["content", "auth_hash"];

      // Map saved items to local data
      var saved =
      this.handleItemsResponse(response.saved_items, omitFields);

      // Create copies of items or alternate their uuids if neccessary
      this.handleUnsavedItemsResponse(response.unsaved)

      this.writeItemsToLocalStorage(saved, false, null);

      this.syncStatus.syncOpInProgress = false;
      this.syncStatus.current += subItems.length;

      // set the sync token at the end, so that if any errors happen above, you can resync
      this.syncToken = response.sync_token;
      this.cursorToken = response.cursor_token;

      onSyncCompletion(response);

      if(this.cursorToken || this.syncStatus.needsMoreSync) {
        setTimeout(function () {
          this.sync(callback, options);
        }.bind(this), 10); // wait 10ms to allow UI to update
      } else if(this.repeatOnCompletion) {
        this.repeatOnCompletion = false;
        setTimeout(function () {
          this.sync(callback, options);
        }.bind(this), 10); // wait 10ms to allow UI to update
      } else {
        this.writeItemsToLocalStorage(this.allRetreivedItems, false, null);
        this.allRetreivedItems = [];

        this.callQueuedCallbacksAndCurrent(callback, response);
        this.$rootScope.$broadcast("sync:completed");

        this.syncPendingSingletons();
      }
    }.bind(this);

    try {
      this.httpManager.postAbsolute(this.syncURL, params, function(response){

        try {
          onSyncSuccess(response);
        } catch(e) {
          console.log("Caught sync success exception:", e);
        }

      }.bind(this), function(response){
        console.log("Sync error: ", response);
        var error = response ? response.error : {message: "Could not connect to server."};

        this.syncStatus.syncOpInProgress = false;
        this.syncStatus.error = error;
        this.writeItemsToLocalStorage(allDirtyItems, false, null);

        onSyncCompletion(response);

        this.$rootScope.$broadcast("sync:error", error);

        this.callQueuedCallbacksAndCurrent(callback, {error: "Sync error"});
      }.bind(this));
    }
    catch(e) {
      console.log("Sync exception caught:", e);
    }
  }

  syncPendingSingletons() {

    this.syncableSingletons = [];

    if(this.pendingSingletons.length == 0) {
      return;
    }

    let toBeDeleted = [];
    for(var singleton of this.pendingSingletons) {
      // Find existing items that may already exist
      var items = this.modelManager.itemsForContentType(singleton.content_type);

      if(items.length == 0) {
        // Can't find similar, safe to sync
        this.syncableSingletons.push(singleton);
        continue;
      }

      for(var item of items) {
        // Skip own item
        if(item.uuid == singleton.uuid) {
          // If there's only 1 item found, then it's safe to sync this item
          if(items.length == 1) {
            this.syncableSingletons.push(singleton);
          }
          continue;
        }

        var itemAlreadyExists = item.singleton();
        if(itemAlreadyExists) {
          // Delete the pending singleton
          toBeDeleted.push(singleton);
        } else {
          this.syncableSingletons.push(singleton);
        }
      }
    }

    var sync = () => {
      this.pendingSingletons = [];
      this.sync();
    }

    if(toBeDeleted.length) {
      this.modelManager.removeItemsLocally(toBeDeleted, () => {
        sync();
      });
    } else {
      sync();
    }
  }

  handleItemsResponse(responseItems, omitFields) {
    var keys = this.userManager.keys() || this.passcodeManager.keys();
    EncryptionHelper.decryptMultipleItems(responseItems, keys);
    var items = this.modelManager.mapResponseItemsToLocalModelsOmittingFields(responseItems, omitFields);
    return items;
  }

  handleUnsavedItemsResponse(unsaved) {
    if(unsaved.length == 0) {
      return;
    }

    console.log("Handle unsaved", unsaved);

    var i = 0;
    var handleNext = function() {
      if(i >= unsaved.length) {
        // Handled all items
        this.sync(null, {additionalFields: ["created_at", "updated_at"]});
        return;
      }

      var handled = false;
      var mapping = unsaved[i];
      var itemResponse = mapping.item;
      EncryptionHelper.decryptMultipleItems([itemResponse], this.userManager.keys());
      var item = this.modelManager.findItem(itemResponse.uuid);

      if(!item) {
        // Could be deleted
        ++i;
        handleNext();
        return;
      }

      var error = mapping.error;

      if(error.tag === "uuid_conflict") {
        // UUID conflicts can occur if a user attempts to
        // import an old data archive with uuids from the old account into a new account
        handled = true;
        this.modelManager.alternateUUIDForItem(item, handleNext, true);
      }

      else if(error.tag === "sync_conflict" && !item.singleton()) {
        // Create a new item with the same contents of this item if the contents differ
        // We want a new uuid for the new item. Note that this won't neccessarily adjust references.
        itemResponse.uuid = null;

        var dup = this.modelManager.createDuplicateItem(itemResponse, item);
        if(!itemResponse.deleted && JSON.stringify(item.structureParams()) !== JSON.stringify(dup.structureParams())) {
          this.modelManager.addItem(dup);
          dup.conflict_of = item.uuid;
          dup.setDirty(true);
        }
      }

      ++i;

      if(!handled) {
        handleNext();
      }

    }.bind(this);

    handleNext();
  }

  clearSyncToken() {
    this.storageManager.removeItem("syncToken");
  }

  destroyLocalData(callback) {
    this.storageManager.clear();
    this.storageManager.clearAllModels(function(){
      if(callback) {
        this.$timeout(function(){
          callback();
        })
      }
    }.bind(this));
  }
}

angular.module('app.frontend').service('syncManager', SyncManager);
