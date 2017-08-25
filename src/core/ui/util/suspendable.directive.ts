import angular from 'angular'

import {ITimeoutService} from 'angular'

let prevUniqueNumber = 0

function uniqueNumber () {
  let date = Date.now()

  // If created at same millisecond as previous
  if (date <= prevUniqueNumber) {
    date = ++prevUniqueNumber
  } else {
    prevUniqueNumber = date
  }

  return date
}

export default function ($timeout: ITimeoutService) {
  'ngInject'

  return {
    link: (scope, element, attrs: any) => {
      let windowElement = angular.element(window)
      let DEBUG = attrs.suspendableDebug === 'true'
      let watchersForId = {}
      let uniqueSuspendableId = Math.random().toString(32).slice(2)
      let trackedEvents = ['scroll.suspendable-' + uniqueSuspendableId, 'resize.suspendable-' + uniqueSuspendableId]
      let heartbeat
      let scopeCheckFunc

      // Attach custom events 'suspend' and 'resume' to our 'suspendable' element
      // Whenever these events get fired, we pass a unique identifier corresponding to
      // the contained ng-scope to suspend/resume. We keep a map of scopeId -> scope.$$watchers
      // Keep these events as raw jQuery, using $rootScope.$on and $rootScope.$emit as an event bus
      // led to additional performance issues
      element.on('suspend', (event, suspendId, scopeToSuspend) => {
        if (!watchersForId[suspendId]) {
          watchersForId[suspendId] = scopeToSuspend.$$watchers
          scopeToSuspend.$$watchers = []
        }
      }).on('resume', (event, resumeId, scopeToResume) => {
        if (watchersForId[resumeId]) {
          scopeToResume.$$watchers = watchersForId[resumeId]
          delete watchersForId[resumeId]
        }
      })

      // If the scope gets destroyed, unbind the listeners we created
      scope.$on('$destroy', () => {
        windowElement.off(trackedEvents.join(' '))
        element.off('suspend resume')
        clearInterval(heartbeat)
        watchersForId = null
      })

      scopeCheckFunc = () => {
        let windowOffset = window.scrollY
        let windowHeight = window.innerHeight
        let scopeElems = element[0].querySelectorAll('.ng-scope, .ng-isolate-scope')
        let scopes = []
        for (let scopeElem of scopeElems) {
          let toAdd = {
            scope: angular.element(scopeElem).scope(),
            elem: scopeElem
          }
          scopes.push(toAdd)
        }

        for (let scope of scopes) {
          let scopeElement = angular.element(scope.elem)
          let offset = scopeElement.offset()

          if (!scopeElement.attr('data-scope-id')) {
            scopeElement.attr('data-scope-id', uniqueNumber())
          }

          // TODO this implementation is naive and there should be finer grained checks around an element's position vs page position
          let event = (offset.top <= windowOffset || offset.top >= windowOffset + windowHeight || !scopeElement.is(':visible')) ? 'suspend' : 'resume'

          if (DEBUG) {
            if (event === 'suspend') {
              scopeElement.css('border-color', 'red')
            } else if (event === 'resume') {
              scopeElement.css('border-color', 'green')
            }
          }

          element.trigger(event, [scopeElement.attr('data-scope-id'), scope.scope])
        }
      }

      // Clean up after long/fast scrolls and reattach if hidden elements become visible
      heartbeat = setInterval(scopeCheckFunc, 2500)

      // Attach namespaced scroll and resize events to the window object. Only call the listener every 50ms
      // The listener will find all scopes within the container, attach a unique ID if necessary, and trigger
      // the appropriate event based on window scroll position and element offset.
      windowElement.on(trackedEvents.join(' ') as any, $timeout(() => {
        scopeCheckFunc()
      }, 50))
    }
  }
}
