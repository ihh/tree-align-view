(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
window.RapidNeighborJoining = require('./index')

},{"./index":4}],2:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.RapidNeighborJoining = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _utils = require("./utils.js");

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var RapidNeighborJoining = exports.RapidNeighborJoining = function () {
    /* phylogenetic tree as object */
    /* set of removed indices from D */
    /* taxa array */
    /* number of taxa */
    /* sorted distance matrix */
    function RapidNeighborJoining(D, taxa) {
        var copyDistanceMatrix = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
        var taxonIdAccessor = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : function (d) {
            return d.name;
        };

        _classCallCheck(this, RapidNeighborJoining);

        if (taxa.length != D.length) {
            console.error("Row/column size of the distance matrix does not agree with the size of taxa matrix");
            return;
        }
        var N = this.N = taxa.length;
        this.cN = this.N;
        if (copyDistanceMatrix) {
            this.D = new Array(N);
            for (var i = 0; i < N; i++) {
                this.D[i] = (0, _utils.arrayCopy)(D[i]);
            }
        } else {
            this.D = D;
        }
        this.taxa = taxa;
        this.labelToTaxon = {};
        this.currIndexToLabel = new Array(N);
        this.rowChange = new Array(N);
        this.newRow = new Array(N);
        this.labelToNode = new Array(2 * N);
        this.nextIndex = N;
        this.initializeSI();
        this.removedIndices = new Set();
        this.indicesLeft = new Set();
        for (var _i = 0; _i < N; _i++) {
            this.currIndexToLabel[_i] = _i;
            this.indicesLeft.add(_i);
        }
        this.rowSumMax = 0;
        this.PNewick = "";
        this.taxonIdAccessor = taxonIdAccessor;
        return this;
    } /* phylogenetic tree in Newick format */
    /* set of yet not processed indices */
    /* number of taxa left */
    /* index map from S to D */
    /* distance matrix */


    _createClass(RapidNeighborJoining, [{
        key: "initializeSI",
        value: function initializeSI() {
            var N = this.N;

            this.I = new Array(N);
            this.S = new Array(N);

            for (var i = 0; i < N; i++) {
                var sortedRow = (0, _utils.sortWithIndices)(this.D[i], i, true);
                this.S[i] = sortedRow;
                this.I[i] = sortedRow.sortIndices;
            }
        }
    }, {
        key: "search",
        value: function search() {

            var qMin = Infinity,
                D = this.D,
                cN = this.cN,
                n2 = cN - 2,
                S = this.S,
                I = this.I,
                rowSums = this.rowSums,
                removedColumns = this.removedIndices,
                uMax = this.rowSumMax,
                q = void 0,
                minI = -1,
                minJ = -1,
                c2 = void 0;

            // initial guess for qMin
            for (var r = 0; r < this.N; r++) {
                if (removedColumns.has(r)) continue;
                c2 = I[r][0];
                if (removedColumns.has(c2)) continue;
                q = D[r][c2] * n2 - rowSums[r] - rowSums[c2];
                if (q < qMin) {
                    qMin = q;
                    minI = r;
                    minJ = c2;
                }
            }

            for (var _r = 0; _r < this.N; _r++) {
                if (removedColumns.has(_r)) continue;
                for (var c = 0; c < S[_r].length; c++) {
                    c2 = I[_r][c];
                    if (removedColumns.has(c2)) continue;
                    if (S[_r][c] * n2 - rowSums[_r] - uMax > qMin) break;
                    q = D[_r][c2] * n2 - rowSums[_r] - rowSums[c2];
                    if (q < qMin) {
                        qMin = q;
                        minI = _r;
                        minJ = c2;
                    }
                }
            }

            return { minI: minI, minJ: minJ };
        }
    }, {
        key: "run",
        value: function run() {
            var minI = void 0,
                minJ = void 0,
                d1 = void 0,
                d2 = void 0,
                l1 = void 0,
                l2 = void 0,
                node1 = void 0,
                node2 = void 0,
                node3 = void 0,
                self = this;

            function setUpNode(label, distance) {
                var node = void 0;
                if (label < self.N) {
                    node = new PhyloNode(self.taxa[label], distance);
                    self.labelToNode[label] = node;
                } else {
                    node = self.labelToNode[label];
                    node.setLength(distance);
                }
                return node;
            }

            this.rowSums = (0, _utils.sumRows)(this.D);
            for (var i = 0; i < this.cN; i++) {
                if (this.rowSums[i] > this.rowSumMax) this.rowSumMax = this.rowSums[i];
            }

            while (this.cN > 2) {
                var _search = this.search();
                //if (this.cN % 100 == 0 ) console.log(this.cN);


                minI = _search.minI;
                minJ = _search.minJ;


                d1 = 0.5 * this.D[minI][minJ] + (this.rowSums[minI] - this.rowSums[minJ]) / (2 * this.cN - 4);
                d2 = this.D[minI][minJ] - d1;

                l1 = this.currIndexToLabel[minI];
                l2 = this.currIndexToLabel[minJ];

                node1 = setUpNode(l1, d1);
                node2 = setUpNode(l2, d2);
                node3 = new PhyloNode(null, null, node1, node2);

                this.recalculateDistanceMatrix(minI, minJ);
                var sorted = (0, _utils.sortWithIndices)(this.D[minJ], minJ, true);
                this.S[minJ] = sorted;
                this.I[minJ] = sorted.sortIndices;
                this.S[minI] = this.I[minI] = [];
                this.cN--;

                this.labelToNode[this.nextIndex] = node3;
                this.currIndexToLabel[minI] = -1;
                this.currIndexToLabel[minJ] = this.nextIndex++;
            }

            var left = this.indicesLeft.values();
            minI = left.next().value;
            minJ = left.next().value;

            l1 = this.currIndexToLabel[minI];
            l2 = this.currIndexToLabel[minJ];
            d1 = d2 = this.D[minI][minJ] / 2;

            node1 = setUpNode(l1, d1);
            node2 = setUpNode(l2, d2);

            this.P = new PhyloNode(null, null, node1, node2);
        }
    }, {
        key: "recalculateDistanceMatrix",
        value: function recalculateDistanceMatrix(joinedIndex1, joinedIndex2) {
            var D = this.D,
                n = D.length,
                sum = 0,
                aux = void 0,
                aux2 = void 0,
                removedIndices = this.removedIndices,
                rowSums = this.rowSums,
                newRow = this.newRow,
                rowChange = this.rowChange,
                newMax = 0;

            removedIndices.add(joinedIndex1);
            for (var i = 0; i < n; i++) {
                if (removedIndices.has(i)) continue;
                aux = D[joinedIndex1][i] + D[joinedIndex2][i];
                aux2 = D[joinedIndex1][joinedIndex2];
                newRow[i] = 0.5 * (aux - aux2);
                sum += newRow[i];
                rowChange[i] = -0.5 * (aux + aux2);
            }
            for (var _i2 = 0; _i2 < n; _i2++) {
                D[joinedIndex1][_i2] = -1;
                D[_i2][joinedIndex1] = -1;
                if (removedIndices.has(_i2)) continue;
                D[joinedIndex2][_i2] = newRow[_i2];
                D[_i2][joinedIndex2] = newRow[_i2];
                rowSums[_i2] += rowChange[_i2];
                if (rowSums[_i2] > newMax) newMax = rowSums[_i2];
            }
            rowSums[joinedIndex1] = 0;
            rowSums[joinedIndex2] = sum;
            if (sum > newMax) newMax = sum;
            this.rowSumMax = newMax;
            this.indicesLeft.delete(joinedIndex1);
        }
    }, {
        key: "createNewickTree",
        value: function createNewickTree(node) {
            if (node.taxon) {
                // leaf node
                this.PNewick += this.taxonIdAccessor(node.taxon);
            } else {
                // node with children
                this.PNewick += "(";
                for (var i = 0; i < node.children.length; i++) {
                    this.createNewickTree(node.children[i]);
                    if (i < node.children.length - 1) this.PNewick += ",";
                }
                this.PNewick += ")";
            }
            if (node.length) {
                this.PNewick += ":" + node.length;
            }
        }
    }, {
        key: "getAsObject",
        value: function getAsObject() {
            return this.P;
        }
    }, {
        key: "getAsNewick",
        value: function getAsNewick() {
            this.PNewick = "";
            this.createNewickTree(this.P);
            this.PNewick += ";";
            return this.PNewick;
        }
    }]);

    return RapidNeighborJoining;
}();

var PhyloNode = function () {
    function PhyloNode() {
        var taxon = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
        var length = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
        var child1 = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;
        var child2 = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : null;

        _classCallCheck(this, PhyloNode);

        this.taxon = taxon;
        this.length = length;
        this.children = [];
        if (child1 !== null) this.children.push(child1);
        if (child2 !== null) this.children.push(child2);
    }

    _createClass(PhyloNode, [{
        key: "setLength",
        value: function setLength(length) {
            this.length = length;
        }
    }]);

    return PhyloNode;
}();
},{"./utils.js":3}],3:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.allocateSquareMatrix = allocateSquareMatrix;
exports.arrayCopy = arrayCopy;
exports.sumRows = sumRows;
exports.sortWithIndices = sortWithIndices;

var _timsort = require('timsort');

var TimSort = _interopRequireWildcard(_timsort);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function allocateSquareMatrix(n) {
    var value = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

    var a = new Array(n);
    for (var i = 0; i < n; i++) {
        a[i] = new Array(n);
        if (value !== null) a[i].fill(value);
    }
    return a;
}

function arrayCopy(a) {
    var b = new Array(a.length),
        i = a.length;
    while (i--) {
        b[i] = a[i];
    }
    return b;
}

function sumRows(a) {
    var sum = void 0,
        n = a.length,
        sums = new Array(n);

    for (var i = 0; i < n; i++) {
        sum = 0;
        for (var j = 0; j < n; j++) {
            if (a[i][j] === undefined) continue;
            sum += a[i][j];
        }
        sums[i] = sum;
    }

    return sums;
}

function sortWithIndices(toSort) {
    var skip = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : -1;
    var timsort = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

    var n = toSort.length;
    var indexCopy = new Array(n);
    var valueCopy = new Array(n);
    var i2 = 0;

    for (var i = 0; i < n; i++) {
        if (toSort[i] === -1 || i === skip) continue;
        indexCopy[i2] = i;
        valueCopy[i2++] = toSort[i];
    }
    indexCopy.length = i2;
    valueCopy.length = i2;

    if (timsort) {
        TimSort.sort(indexCopy, function (a, b) {
            return toSort[a] - toSort[b];
        });
    } else {
        indexCopy.sort(function (a, b) {
            return toSort[a] - toSort[b];
        });
    }

    TimSort.sort(indexCopy, function (left, right) {
        return toSort[left] - toSort[right];
    });

    valueCopy.sortIndices = indexCopy;
    for (var j = 0; j < i2; j++) {
        valueCopy[j] = toSort[indexCopy[j]];
    }
    return valueCopy;
}
},{"timsort":6}],4:[function(require,module,exports){
module.exports = {
    RapidNeighborJoining: require('./dist/neighbor-joining.js').RapidNeighborJoining,
    allocateSquareMatrix: require('./dist/utils.js').allocateSquareMatrix
};
},{"./dist/neighbor-joining.js":2,"./dist/utils.js":3}],5:[function(require,module,exports){
/****
 * The MIT License
 *
 * Copyright (c) 2015 Marco Ziccardi
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 ****/
(function (global, factory) {
  if (typeof define === 'function' && define.amd) {
    define('timsort', ['exports'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports);
  } else {
    var mod = {
      exports: {}
    };
    factory(mod.exports);
    global.timsort = mod.exports;
  }
})(this, function (exports) {
  'use strict';

  exports.__esModule = true;
  exports.sort = sort;

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError('Cannot call a class as a function');
    }
  }

  var DEFAULT_MIN_MERGE = 32;

  var DEFAULT_MIN_GALLOPING = 7;

  var DEFAULT_TMP_STORAGE_LENGTH = 256;

  function alphabeticalCompare(a, b) {
    if (a === b) {
      return 0;
    } else {
      var aStr = String(a);
      var bStr = String(b);

      if (aStr === bStr) {
        return 0;
      } else {
        return aStr < bStr ? -1 : 1;
      }
    }
  }

  function minRunLength(n) {
    var r = 0;

    while (n >= DEFAULT_MIN_MERGE) {
      r |= n & 1;
      n >>= 1;
    }

    return n + r;
  }

  function makeAscendingRun(array, lo, hi, compare) {
    var runHi = lo + 1;

    if (runHi === hi) {
      return 1;
    }

    if (compare(array[runHi++], array[lo]) < 0) {
      while (runHi < hi && compare(array[runHi], array[runHi - 1]) < 0) {
        runHi++;
      }

      reverseRun(array, lo, runHi);
    } else {
      while (runHi < hi && compare(array[runHi], array[runHi - 1]) >= 0) {
        runHi++;
      }
    }

    return runHi - lo;
  }

  function reverseRun(array, lo, hi) {
    hi--;

    while (lo < hi) {
      var t = array[lo];
      array[lo++] = array[hi];
      array[hi--] = t;
    }
  }

  function binaryInsertionSort(array, lo, hi, start, compare) {
    if (start === lo) {
      start++;
    }

    for (; start < hi; start++) {
      var pivot = array[start];

      var left = lo;
      var right = start;

      while (left < right) {
        var mid = left + right >>> 1;

        if (compare(pivot, array[mid]) < 0) {
          right = mid;
        } else {
          left = mid + 1;
        }
      }

      var n = start - left;

      switch (n) {
        case 3:
          array[left + 3] = array[left + 2];

        case 2:
          array[left + 2] = array[left + 1];

        case 1:
          array[left + 1] = array[left];
          break;
        default:
          while (n > 0) {
            array[left + n] = array[left + n - 1];
            n--;
          }
      }

      array[left] = pivot;
    }
  }

  function gallopLeft(value, array, start, length, hint, compare) {
    var lastOffset = 0;
    var maxOffset = 0;
    var offset = 1;

    if (compare(value, array[start + hint]) > 0) {
      maxOffset = length - hint;

      while (offset < maxOffset && compare(value, array[start + hint + offset]) > 0) {
        lastOffset = offset;
        offset = (offset << 1) + 1;

        if (offset <= 0) {
          offset = maxOffset;
        }
      }

      if (offset > maxOffset) {
        offset = maxOffset;
      }

      lastOffset += hint;
      offset += hint;
    } else {
      maxOffset = hint + 1;
      while (offset < maxOffset && compare(value, array[start + hint - offset]) <= 0) {
        lastOffset = offset;
        offset = (offset << 1) + 1;

        if (offset <= 0) {
          offset = maxOffset;
        }
      }
      if (offset > maxOffset) {
        offset = maxOffset;
      }

      var tmp = lastOffset;
      lastOffset = hint - offset;
      offset = hint - tmp;
    }

    lastOffset++;
    while (lastOffset < offset) {
      var m = lastOffset + (offset - lastOffset >>> 1);

      if (compare(value, array[start + m]) > 0) {
        lastOffset = m + 1;
      } else {
        offset = m;
      }
    }
    return offset;
  }

  function gallopRight(value, array, start, length, hint, compare) {
    var lastOffset = 0;
    var maxOffset = 0;
    var offset = 1;

    if (compare(value, array[start + hint]) < 0) {
      maxOffset = hint + 1;

      while (offset < maxOffset && compare(value, array[start + hint - offset]) < 0) {
        lastOffset = offset;
        offset = (offset << 1) + 1;

        if (offset <= 0) {
          offset = maxOffset;
        }
      }

      if (offset > maxOffset) {
        offset = maxOffset;
      }

      var tmp = lastOffset;
      lastOffset = hint - offset;
      offset = hint - tmp;
    } else {
      maxOffset = length - hint;

      while (offset < maxOffset && compare(value, array[start + hint + offset]) >= 0) {
        lastOffset = offset;
        offset = (offset << 1) + 1;

        if (offset <= 0) {
          offset = maxOffset;
        }
      }

      if (offset > maxOffset) {
        offset = maxOffset;
      }

      lastOffset += hint;
      offset += hint;
    }

    lastOffset++;

    while (lastOffset < offset) {
      var m = lastOffset + (offset - lastOffset >>> 1);

      if (compare(value, array[start + m]) < 0) {
        offset = m;
      } else {
        lastOffset = m + 1;
      }
    }

    return offset;
  }

  var TimSort = (function () {
    function TimSort(array, compare) {
      _classCallCheck(this, TimSort);

      this.array = null;
      this.compare = null;
      this.minGallop = DEFAULT_MIN_GALLOPING;
      this.length = 0;
      this.tmpStorageLength = DEFAULT_TMP_STORAGE_LENGTH;
      this.stackLength = 0;
      this.runStart = null;
      this.runLength = null;
      this.stackSize = 0;

      this.array = array;
      this.compare = compare;

      this.length = array.length;

      if (this.length < 2 * DEFAULT_TMP_STORAGE_LENGTH) {
        this.tmpStorageLength = this.length >>> 1;
      }

      this.tmp = new Array(this.tmpStorageLength);

      this.stackLength = this.length < 120 ? 5 : this.length < 1542 ? 10 : this.length < 119151 ? 19 : 40;

      this.runStart = new Array(this.stackLength);
      this.runLength = new Array(this.stackLength);
    }

    TimSort.prototype.pushRun = function pushRun(runStart, runLength) {
      this.runStart[this.stackSize] = runStart;
      this.runLength[this.stackSize] = runLength;
      this.stackSize += 1;
    };

    TimSort.prototype.mergeRuns = function mergeRuns() {
      while (this.stackSize > 1) {
        var n = this.stackSize - 2;

        if (n >= 1 && this.runLength[n - 1] <= this.runLength[n] + this.runLength[n + 1] || n >= 2 && this.runLength[n - 2] <= this.runLength[n] + this.runLength[n - 1]) {

          if (this.runLength[n - 1] < this.runLength[n + 1]) {
            n--;
          }
        } else if (this.runLength[n] > this.runLength[n + 1]) {
          break;
        }
        this.mergeAt(n);
      }
    };

    TimSort.prototype.forceMergeRuns = function forceMergeRuns() {
      while (this.stackSize > 1) {
        var n = this.stackSize - 2;

        if (n > 0 && this.runLength[n - 1] < this.runLength[n + 1]) {
          n--;
        }

        this.mergeAt(n);
      }
    };

    TimSort.prototype.mergeAt = function mergeAt(i) {
      var compare = this.compare;
      var array = this.array;

      var start1 = this.runStart[i];
      var length1 = this.runLength[i];
      var start2 = this.runStart[i + 1];
      var length2 = this.runLength[i + 1];

      this.runLength[i] = length1 + length2;

      if (i === this.stackSize - 3) {
        this.runStart[i + 1] = this.runStart[i + 2];
        this.runLength[i + 1] = this.runLength[i + 2];
      }

      this.stackSize--;

      var k = gallopRight(array[start2], array, start1, length1, 0, compare);
      start1 += k;
      length1 -= k;

      if (length1 === 0) {
        return;
      }

      length2 = gallopLeft(array[start1 + length1 - 1], array, start2, length2, length2 - 1, compare);

      if (length2 === 0) {
        return;
      }

      if (length1 <= length2) {
        this.mergeLow(start1, length1, start2, length2);
      } else {
        this.mergeHigh(start1, length1, start2, length2);
      }
    };

    TimSort.prototype.mergeLow = function mergeLow(start1, length1, start2, length2) {

      var compare = this.compare;
      var array = this.array;
      var tmp = this.tmp;
      var i = 0;

      for (i = 0; i < length1; i++) {
        tmp[i] = array[start1 + i];
      }

      var cursor1 = 0;
      var cursor2 = start2;
      var dest = start1;

      array[dest++] = array[cursor2++];

      if (--length2 === 0) {
        for (i = 0; i < length1; i++) {
          array[dest + i] = tmp[cursor1 + i];
        }
        return;
      }

      if (length1 === 1) {
        for (i = 0; i < length2; i++) {
          array[dest + i] = array[cursor2 + i];
        }
        array[dest + length2] = tmp[cursor1];
        return;
      }

      var minGallop = this.minGallop;

      while (true) {
        var count1 = 0;
        var count2 = 0;
        var exit = false;

        do {
          if (compare(array[cursor2], tmp[cursor1]) < 0) {
            array[dest++] = array[cursor2++];
            count2++;
            count1 = 0;

            if (--length2 === 0) {
              exit = true;
              break;
            }
          } else {
            array[dest++] = tmp[cursor1++];
            count1++;
            count2 = 0;
            if (--length1 === 1) {
              exit = true;
              break;
            }
          }
        } while ((count1 | count2) < minGallop);

        if (exit) {
          break;
        }

        do {
          count1 = gallopRight(array[cursor2], tmp, cursor1, length1, 0, compare);

          if (count1 !== 0) {
            for (i = 0; i < count1; i++) {
              array[dest + i] = tmp[cursor1 + i];
            }

            dest += count1;
            cursor1 += count1;
            length1 -= count1;
            if (length1 <= 1) {
              exit = true;
              break;
            }
          }

          array[dest++] = array[cursor2++];

          if (--length2 === 0) {
            exit = true;
            break;
          }

          count2 = gallopLeft(tmp[cursor1], array, cursor2, length2, 0, compare);

          if (count2 !== 0) {
            for (i = 0; i < count2; i++) {
              array[dest + i] = array[cursor2 + i];
            }

            dest += count2;
            cursor2 += count2;
            length2 -= count2;

            if (length2 === 0) {
              exit = true;
              break;
            }
          }
          array[dest++] = tmp[cursor1++];

          if (--length1 === 1) {
            exit = true;
            break;
          }

          minGallop--;
        } while (count1 >= DEFAULT_MIN_GALLOPING || count2 >= DEFAULT_MIN_GALLOPING);

        if (exit) {
          break;
        }

        if (minGallop < 0) {
          minGallop = 0;
        }

        minGallop += 2;
      }

      this.minGallop = minGallop;

      if (minGallop < 1) {
        this.minGallop = 1;
      }

      if (length1 === 1) {
        for (i = 0; i < length2; i++) {
          array[dest + i] = array[cursor2 + i];
        }
        array[dest + length2] = tmp[cursor1];
      } else if (length1 === 0) {
        throw new Error('mergeLow preconditions were not respected');
      } else {
        for (i = 0; i < length1; i++) {
          array[dest + i] = tmp[cursor1 + i];
        }
      }
    };

    TimSort.prototype.mergeHigh = function mergeHigh(start1, length1, start2, length2) {
      var compare = this.compare;
      var array = this.array;
      var tmp = this.tmp;
      var i = 0;

      for (i = 0; i < length2; i++) {
        tmp[i] = array[start2 + i];
      }

      var cursor1 = start1 + length1 - 1;
      var cursor2 = length2 - 1;
      var dest = start2 + length2 - 1;
      var customCursor = 0;
      var customDest = 0;

      array[dest--] = array[cursor1--];

      if (--length1 === 0) {
        customCursor = dest - (length2 - 1);

        for (i = 0; i < length2; i++) {
          array[customCursor + i] = tmp[i];
        }

        return;
      }

      if (length2 === 1) {
        dest -= length1;
        cursor1 -= length1;
        customDest = dest + 1;
        customCursor = cursor1 + 1;

        for (i = length1 - 1; i >= 0; i--) {
          array[customDest + i] = array[customCursor + i];
        }

        array[dest] = tmp[cursor2];
        return;
      }

      var minGallop = this.minGallop;

      while (true) {
        var count1 = 0;
        var count2 = 0;
        var exit = false;

        do {
          if (compare(tmp[cursor2], array[cursor1]) < 0) {
            array[dest--] = array[cursor1--];
            count1++;
            count2 = 0;
            if (--length1 === 0) {
              exit = true;
              break;
            }
          } else {
            array[dest--] = tmp[cursor2--];
            count2++;
            count1 = 0;
            if (--length2 === 1) {
              exit = true;
              break;
            }
          }
        } while ((count1 | count2) < minGallop);

        if (exit) {
          break;
        }

        do {
          count1 = length1 - gallopRight(tmp[cursor2], array, start1, length1, length1 - 1, compare);

          if (count1 !== 0) {
            dest -= count1;
            cursor1 -= count1;
            length1 -= count1;
            customDest = dest + 1;
            customCursor = cursor1 + 1;

            for (i = count1 - 1; i >= 0; i--) {
              array[customDest + i] = array[customCursor + i];
            }

            if (length1 === 0) {
              exit = true;
              break;
            }
          }

          array[dest--] = tmp[cursor2--];

          if (--length2 === 1) {
            exit = true;
            break;
          }

          count2 = length2 - gallopLeft(array[cursor1], tmp, 0, length2, length2 - 1, compare);

          if (count2 !== 0) {
            dest -= count2;
            cursor2 -= count2;
            length2 -= count2;
            customDest = dest + 1;
            customCursor = cursor2 + 1;

            for (i = 0; i < count2; i++) {
              array[customDest + i] = tmp[customCursor + i];
            }

            if (length2 <= 1) {
              exit = true;
              break;
            }
          }

          array[dest--] = array[cursor1--];

          if (--length1 === 0) {
            exit = true;
            break;
          }

          minGallop--;
        } while (count1 >= DEFAULT_MIN_GALLOPING || count2 >= DEFAULT_MIN_GALLOPING);

        if (exit) {
          break;
        }

        if (minGallop < 0) {
          minGallop = 0;
        }

        minGallop += 2;
      }

      this.minGallop = minGallop;

      if (minGallop < 1) {
        this.minGallop = 1;
      }

      if (length2 === 1) {
        dest -= length1;
        cursor1 -= length1;
        customDest = dest + 1;
        customCursor = cursor1 + 1;

        for (i = length1 - 1; i >= 0; i--) {
          array[customDest + i] = array[customCursor + i];
        }

        array[dest] = tmp[cursor2];
      } else if (length2 === 0) {
        throw new Error('mergeHigh preconditions were not respected');
      } else {
        customCursor = dest - (length2 - 1);
        for (i = 0; i < length2; i++) {
          array[customCursor + i] = tmp[i];
        }
      }
    };

    return TimSort;
  })();

  function sort(array, compare, lo, hi) {
    if (!Array.isArray(array)) {
      throw new TypeError('Can only sort arrays');
    }

    if (!compare) {
      compare = alphabeticalCompare;
    } else if (typeof compare !== 'function') {
      hi = lo;
      lo = compare;
      compare = alphabeticalCompare;
    }

    if (!lo) {
      lo = 0;
    }
    if (!hi) {
      hi = array.length;
    }

    var remaining = hi - lo;

    if (remaining < 2) {
      return;
    }

    var runLength = 0;

    if (remaining < DEFAULT_MIN_MERGE) {
      runLength = makeAscendingRun(array, lo, hi, compare);
      binaryInsertionSort(array, lo, hi, lo + runLength, compare);
      return;
    }

    var ts = new TimSort(array, compare);

    var minRun = minRunLength(remaining);

    do {
      runLength = makeAscendingRun(array, lo, hi, compare);
      if (runLength < minRun) {
        var force = remaining;
        if (force > minRun) {
          force = minRun;
        }

        binaryInsertionSort(array, lo, lo + force, lo + runLength, compare);
        runLength = force;
      }

      ts.pushRun(lo, runLength);
      ts.mergeRuns();

      remaining -= runLength;
      lo += runLength;
    } while (remaining !== 0);

    ts.forceMergeRuns();
  }
});

},{}],6:[function(require,module,exports){
module.exports = require('./build/timsort.js');
},{"./build/timsort.js":5}]},{},[1]);
