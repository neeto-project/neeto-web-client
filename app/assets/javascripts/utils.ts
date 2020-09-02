export const isDev = process.env.NODE_ENV === 'development';

export function getParameterByName(name: string, url: string) {
  name = name.replace(/[[\]]/g, '\\$&');
  var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)');
  var results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return '';
  return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

export function isNullOrUndefined(value: any) {
  return value === null || value === undefined;
}

export function getPlatformString() {
  try {
    const platform = navigator.platform.toLowerCase();
    let trimmed = '';
    if (platform.indexOf('mac') !== -1) {
      trimmed = 'mac';
    } else if (platform.indexOf('win') !== -1) {
      trimmed = 'windows';
    }
    if (platform.indexOf('linux') !== -1) {
      trimmed = 'linux';
    }
    return trimmed + (isDesktopApplication() ? '-desktop' : '-web');
  } catch (e) {
    return 'unknown-platform';
  }
}

let sharedDateFormatter: Intl.DateTimeFormat;
export function dateToLocalizedString(date: Date) {
  if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
    if (!sharedDateFormatter) {
      const locale = (
        (navigator.languages && navigator.languages.length)
          ? navigator.languages[0]
          : navigator.language
      );
      sharedDateFormatter = new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'numeric',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return sharedDateFormatter.format(date);
  } else {
    // IE < 11, Safari <= 9.0.
    // In English, this generates the string most similar to
    // the toLocaleDateString() result above.
    return date.toDateString() + ' ' + date.toLocaleTimeString();
  }
}

/** Via https://davidwalsh.name/javascript-debounce-function */
export function debounce(this: any, func: any, wait: number, immediate = false) {
  let timeout: any;
  return () => {
    const context = this;
    const args = arguments;
    const later = function () {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
};

export function isDesktopApplication() {
  return (window as any).isElectron;
}

// https://tc39.github.io/ecma262/#sec-array.prototype.includes
if (!Array.prototype.includes) {
  // eslint-disable-next-line no-extend-native
  Object.defineProperty(Array.prototype, 'includes', {
    value: function(searchElement: any, fromIndex: number) {
      if (this == null) {
        throw new TypeError('"this" is null or not defined');
      }

      // 1. Let O be ? ToObject(this value).
      var o = Object(this);

      // 2. Let len be ? ToLength(? Get(O, "length")).
      var len = o.length >>> 0;

      // 3. If len is 0, return false.
      if (len === 0) {
        return false;
      }

      // 4. Let n be ? ToInteger(fromIndex).
      //    (If fromIndex is undefined, this step produces the value 0.)
      var n = fromIndex | 0;

      // 5. If n ≥ 0, then
      //  a. Let k be n.
      // 6. Else n < 0,
      //  a. Let k be len + n.
      //  b. If k < 0, let k be 0.
      var k = Math.max(n >= 0 ? n : len - Math.abs(n), 0);

      function sameValueZero(x: number, y: number) {
        return (
          x === y ||
          (typeof x === 'number' &&
            typeof y === 'number' &&
            isNaN(x) &&
            isNaN(y))
        );
      }

      // 7. Repeat, while k < len
      while (k < len) {
        // a. Let elementK be the result of ? Get(O, ! ToString(k)).
        // b. If SameValueZero(searchElement, elementK) is true, return true.
        if (sameValueZero(o[k], searchElement)) {
          return true;
        }
        // c. Increase k by 1.
        k++;
      }

      // 8. Return false
      return false;
    }
  });
}

export async function preventRefreshing(
  message: string,
  operation: () => Promise<void> | void
) {
  const onBeforeUnload = window.onbeforeunload;
  try {
    window.onbeforeunload = () => message;
    await operation();
  } finally {
    window.onbeforeunload = onBeforeUnload;
  }
}
