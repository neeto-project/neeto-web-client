angular.module('app.frontend')
  .provider('authManager', function () {

    function domainName()  {
      var domain_comps = location.hostname.split(".");
      var domain = domain_comps[domain_comps.length - 2] + "." + domain_comps[domain_comps.length - 1];
      return domain;
    }

    this.$get = function($rootScope, httpManager, modelManager, dbManager) {
        return new AuthManager($rootScope, httpManager, modelManager, dbManager);
    }

    function AuthManager($rootScope, httpManager, modelManager, dbManager) {

      var userData = localStorage.getItem("user");
      if(userData) {
        this.user = JSON.parse(userData);
      } else {
        // legacy, check for uuid
        var idData = localStorage.getItem("uuid");
        if(idData) {
          this.user = {uuid: idData};
        }
      }

      this.getUserAnalyticsId = function() {
        if(!this.user || !this.user.uuid) {
          return null;
        }
        // anonymize user id irreversably
        return Neeto.crypto.hmac256(this.user.uuid, Neeto.crypto.sha256(localStorage.getItem("pw")));
      }

      this.offline = function() {
        return !this.user;
      }

      this.getAuthParams = function() {
        return JSON.parse(localStorage.getItem("auth_params"));
      }

      this.keys = function() {
        var mk =  localStorage.getItem("mk");
        if(!mk) {
          return null;
        }
        var keys = {mk: mk, ak: localStorage.getItem("ak")};
        return keys;
      }

      this.getAuthParamsForEmail = function(url, email, callback) {
        var requestUrl = url + "/auth/params";
        httpManager.getAbsolute(requestUrl, {email: email}, function(response){
          callback(response);
        }, function(response){
          console.error("Error getting auth params", response);
          callback(null);
        })
      }

      this.supportsPasswordDerivationCost = function(cost) {
        // some passwords are created on platforms with stronger pbkdf2 capabilities, like iOS,
        // which accidentally used 60,000 iterations (now adjusted), which CryptoJS can't handle here (WebCrypto can however).
        // if user has high password cost and is using browser that doesn't support WebCrypto,
        // we want to tell them that they can't login with this browser.
        if(cost > 5000) {
          return Neeto.crypto instanceof SNCryptoWeb ? true : false;
        } else {
          return true;
        }
      }

      this.calculateVerificationTag = function(cost, salt, ak) {
        return Neeto.crypto.hmac256([cost, salt].join(:), ak);
      }

      this.login = function(url, email, password, callback) {
        this.getAuthParamsForEmail(url, email, function(authParams){
          if(!authParams) {
            callback({error : {message: "Unable to get authentication parameters."}});
            return;
          }

          var uploadVTagOnCompletion = false;
          var localVTag = this.calculateVerificationTag(authParams.pw_cost, authParams.pw_salt, this.keys().ak);

          if(authParams.pw_auth) {
            // verify auth params
            if(localVTag !== authParams.pw_auth) {
              alert("Invalid server verification tag, aborting login. Learn more at standardnotes.org/verification.");
              return;
            }
          } else {
            // either user has not uploaded pw_auth, or server is attempting to bypass authentication
            if(confirm("Unable to locate verification tag for server. If this is your first time seeing this message and your account was created before July 2017, press OK to upload verification tag. If your account was created after July 2017, or if you've already seen this message, press cancel to abort login. Learn more at standardnotes.org/verification.")) {
              // upload verification tag on completion
              uploadVTagOnCompletion = true;
            } else {
              return;
            }
          }

          if(!this.supportsPasswordDerivationCost(authParams.pw_cost)) {
            var string = "Your account was created on a platform with higher security capabilities than this browser supports. " +
            "If we attempted to generate your login keys here, it would take hours. " +
            "Please use a browser with more up to date security capabilities, like Google Chrome or Firefox, to login."
            alert(string)
            callback({didDisplayAlert: true});
            return;
          }


          Neeto.crypto.computeEncryptionKeysForUser(_.merge({password: password}, authParams), function(keys){
            var requestUrl = url + "/auth/sign_in";
            var params = {password: keys.pw, email: email};
            httpManager.postAbsolute(requestUrl, params, function(response){
              this.handleAuthResponse(response, email, url, authParams, keys.pw, keys.mk, keys.ak);
              callback(response);
              if(uploadVTagOnCompletion) {
                this.uploadVTagOnCompletion(localVTag);
              }
            }.bind(this), function(response){
              console.error("Error logging in", response);
              callback(response);
            })

          }.bind(this));
        }.bind(this))
      }

      this.uploadVerificationTag = function(tag) {
        var requestUrl = localStorage.getItem("server") + "/auth";
        var params = {pw_auth: tag};

        httpManager.patchAbsolute(requestUrl, params, function(response){
          callback(response);
        }.bind(this), function(response){
          var error = response;
          callback({error: error});
        })
      }

      this.handleAuthResponse = function(response, email, url, authParams, pw, mk, ak) {
        try {
          if(url) {
            localStorage.setItem("server", url);
          }
          localStorage.setItem("user", JSON.stringify(response.user));
          localStorage.setItem("auth_params", JSON.stringify(_.omit(authParams, ["pw_nonce"])));
          localStorage.setItem("pw", pw);
          localStorage.setItem("mk", mk);
          localStorage.setItem("pw", ak);
          localStorage.setItem("jwt", response.token);
        } catch(e) {
          dbManager.displayOfflineAlert();
        }
      }

      this.register = function(url, email, password, callback) {
        Neeto.crypto.generateInitialEncryptionKeysForUser({password: password, email: email}, function(keys, authParams){
          var requestUrl = url + "/auth";
          var params = _.merge({password: keys.pw, email: email}, authParams);

          httpManager.postAbsolute(requestUrl, params, function(response){
            this.handleAuthResponse(response, email, url, authParams, keys.pw, keys.mk, keys.ak);
            callback(response);
          }.bind(this), function(response){
            console.error("Registration error", response);
            callback(response);
          }.bind(this))
        }.bind(this));
      }

      this.changePassword = function(email, new_password, callback) {
        Neeto.crypto.generateInitialEncryptionKeysForUser({password: new_password, email: email}, function(keys, authParams){
          var requestUrl = localStorage.getItem("server") + "/auth/change_pw";
          var params = _.merge({new_password: keys.pw}, authParams);

          httpManager.postAbsolute(requestUrl, params, function(response){
            this.handleAuthResponse(response, email, null, authParams, keys.pw, keys.mk, keys.ak);
            callback(response);
          }.bind(this), function(response){
            var error = response;
            if(!error) {
              error = {message: "Something went wrong while changing your password. Your password was not changed. Please try again."}
            }
            console.error("Change pw error", response);
            callback({error: error});
          })
        })
      }

      this.staticifyObject = function(object) {
        return JSON.parse(JSON.stringify(object));
      }

     }
});
