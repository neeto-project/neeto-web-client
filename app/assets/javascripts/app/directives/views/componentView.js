class ComponentView {

  constructor(componentManager, $timeout) {
    this.restrict = "E";
    this.templateUrl = "directives/component-view.html";
    this.scope = {
      component: "=",
      manualDealloc: "="
    };

    this.componentManager = componentManager;
    this.timeout = $timeout;
  }

  link($scope, el, attrs, ctrl) {
    $scope.el = el;

    let identifier = "component-view-" + Math.random();

    this.componentManager.registerHandler({identifier: identifier, areas: ["*"], activationHandler: (component) => {
      if(component.active) {
        this.timeout(function(){
          var iframe = this.componentManager.iframeForComponent(component);
          if(iframe) {
            iframe.onload = function() {
              this.componentManager.registerComponentWindow(component, iframe.contentWindow);
            }.bind(this);
          }
        }.bind(this));
      }
    },
    actionHandler: function(component, action, data) {
       if(action == "set-size") {
         this.componentManager.handleSetSizeEvent(component, data);
       }
    }.bind(this)});

    $scope.$watch('component', function(component, prevComponent){
      ctrl.componentValueChanging(component, prevComponent);
    });
  }

  controller($scope, $timeout, componentManager, desktopManager) {
    'ngInject';

    this.componentValueChanging = (component, prevComponent) => {
      if(prevComponent && component !== prevComponent) {
        // Deactive old component
        componentManager.deactivateComponent(prevComponent);
      }

      if(component) {
        componentManager.activateComponent(component);
        console.log("Loading", $scope.component.name, $scope.getUrl(), component.valid_until);

        $scope.reloadStatus();
      }
    }

    $scope.reloadStatus = function() {
      $scope.reloading = true;
      let previouslyValid = $scope.componentValid;
      $scope.componentValid = !$scope.component.valid_until || ($scope.component.valid_until && $scope.component.valid_until > new Date());
      if($scope.componentValid !== previouslyValid) {
        if($scope.componentValid) {
          componentManager.activateComponent($scope.component);
        }
      }

      $timeout(() => {
        $scope.reloading = false;
      }, 500)
    }

    $scope.getUrl = function() {
      var url = componentManager.urlForComponent($scope.component);
      $scope.component.runningLocally = url !== ($scope.component.url || $scope.component.hosted_url);
      return url;
    }

    $scope.$on("$destroy", function() {
      componentManager.deregisterHandler($scope.identifier);
      if($scope.component && !$scope.manualDealloc) {
        componentManager.deactivateComponent($scope.component);
      }
    });
  }

}

angular.module('app').directive('componentView', (componentManager, $timeout) => new ComponentView(componentManager, $timeout));