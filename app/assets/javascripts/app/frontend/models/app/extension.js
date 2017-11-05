class Action {
  constructor(json) {
    _.merge(this, json);
    this.running = false; // in case running=true was synced with server since model is uploaded nondiscriminatory
    this.error = false;
    if(this.lastExecuted) {
      // is string
      this.lastExecuted = new Date(this.lastExecuted);
    }
  }

  permissionsString() {
    if(!this.permissions) {
      return "";
    }

    var permission = this.permissions.charAt(0).toUpperCase() + this.permissions.slice(1); // capitalize first letter
    permission += ": ";
    for(var contentType of this.content_types) {
      if(contentType == "*") {
        permission += "All items";
      } else {
        permission += contentType;
      }

      permission += " ";
    }

    return permission;
  }

  encryptionModeString() {
    if(this.verb != "post") {
      return null;
    }
    var encryptionMode = "This action accepts data ";
    if(this.accepts_encrypted && this.accepts_decrypted) {
      encryptionMode += "encrypted or decrypted.";
    } else {
      if(this.accepts_encrypted) {
        encryptionMode += "encrypted.";
      } else {
        encryptionMode += "decrypted.";
      }
    }
    return encryptionMode;
  }

}

class Extension extends Item {
  constructor(json) {
      super(json);

      if(this.encrypted === null || this.encrypted === undefined) {
        // Default to encrypted on creation.
        this.encrypted = true;
      }

      if(json.actions) {
        this.actions = json.actions.map(function(action){
          return new Action(action);
        })
      }

      if(!this.actions) {
        this.actions = [];
      }
  }

  actionsInGlobalContext() {
    return this.actions.filter(function(action){
      return action.context == "global";
    })
  }

  actionsWithContextForItem(item) {
    return this.actions.filter(function(action){
      return action.context == item.content_type || action.context == "Item";
    })
  }

  mapContentToLocalProperties(content) {
    super.mapContentToLocalProperties(content)
    this.name = content.name;
    this.description = content.description;
    this.url = content.url;

    if(content.encrypted !== null && content.encrypted !== undefined) {
      this.encrypted = content.encrypted;
    } else {
      this.encrypted = true;
    }

    this.supported_types = content.supported_types;
    if(content.actions) {
      this.actions = content.actions.map(function(action){
        return new Action(action);
      })
    }
  }

  referenceParams() {
    return null;
  }

  get content_type() {
    return "Extension";
  }

  structureParams() {
    var params = {
      name: this.name,
      url: this.url,
      description: this.description,
      actions: this.actions,
      supported_types: this.supported_types,
      encrypted: this.encrypted
    };

    _.merge(params, super.structureParams());
    return params;
  }

}
