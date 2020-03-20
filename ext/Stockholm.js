var Stockholm = (() => {
  let Stockholm = function() {
    let obj = { gf: {},  // gf[tag] = ARRAY
                gc: {},  // gc[tag] = STRING
                gs: {},  // gs[tag][seqname] = ARRAY
                gr: {},  // gr[tag][seqname] = STRING
                seqname: [],  // optional, specify ordering of rows
                seqdata: {}  // seqdata[seqname] = STRING
              }
    Object.keys(obj).forEach ((prop) => this[prop] = obj[prop])
    return this
  }

  const formatStartRegex = /^# STOCKHOLM 1.0/;
  const formatEndRegex = /^\/\/\s*$/;
  const gfRegex = /^#=GF\s+(\S+)\s+(.*?)\s*$/;
  const gcRegex = /^#=GC\s+(\S+)\s+(.*?)\s*$/;
  const gsRegex = /^#=GS\s+(\S+)\s+(\S+)\s+(.*?)\s*$/;
  const grRegex = /^#=GR\s+(\S+)\s+(\S+)\s+(.*?)\s*$/;
  const lineRegex = /^\s*(\S+)\s+(\S+)\s*$/;
  const nonwhiteRegex = /\S/;

  const noFormatStart = "No format header: # STOCKHOLM 1.0";
  const noFormatEnd = "No format footer: //";
  const badLine = "Malformed line";
  const atLine = (n) => "(At line " + (n+1) + ") ";

  const sniff = (text) => formatStartRegex.test (text);

  const validate = (text) => {
    try {
      parseAll (text, { strict: true })
    } catch (e) {
      return false
    }
    return true
  }

  const error = (err) => { throw err; }
  const warning = (err) => console.warn(err);

  const parseAll = (text, opts) => {
    opts = opts || {}
    const maybeWarning = opts.quiet ? (() => null) : warning;
    const maybeError = opts.strict ? error : maybeWarning;
    let db = [], stock = null
    const lines = text.split("\n")
    lines.forEach ((line, n) => {
      const makeStock = () => {
        if (!stock) {
          maybeError (atLine(n) + noFormatStart);
          stock = new Stockholm();
        }
      };
      let match;
      if (formatStartRegex.test(line)) {
        if (stock) maybeError (atLine(n) + noFormatEnd);
        stock = new Stockholm();
      } else if (formatEndRegex.test(line)) {
        if (stock)
          db.push (stock);
        else
          maybeError (atLine(n) + noFormatStart);
        stock = null;
      } else if (match = gfRegex.exec(line)) {
        makeStock();
        stock.gf[match[1]] = stock.gf[match[1]] || [];
        stock.gf[match[1]].push (match[2]);
      } else if (match = gcRegex.exec(line)) {
        makeStock();
        stock.gc[match[1]] = stock.gc[match[1]] || '';
        stock.gc[match[1]] += match[2];
      } else if (match = gsRegex.exec(line)) {
        makeStock();
        stock.gs[match[1]] = stock.gs[match[1]] || {};
        stock.gs[match[1]][match[2]] = stock.gs[match[1]][match[2]] || [];
        stock.gs[match[1]][match[2]].push (match[3]);
      } else if (match = grRegex.exec(line)) {
        makeStock();
        stock.gr[match[1]] = stock.gr[match[1]] || {};
        stock.gr[match[1]][match[2]] = stock.gr[match[1]][match[2]] || '';
        stock.gr[match[1]][match[2]] += match[3];
      } else if (match = lineRegex.exec(line)) {
        makeStock();
        if (!stock.seqdata[match[1]]) {
          stock.seqdata[match[1]] = '';
          stock.seqname.push (match[1]);
        }
        stock.seqdata[match[1]] += match[2];
      } else if (nonwhiteRegex.test (line)) {
        error (atLine(n) + badLine);
      }
    })
    if (stock) {
      maybeError ("Warning: no end line //");
      db.push (stock);
    }
    return db;
  }

  const parse = (text, opts) => {
    const db = parseAll (text, opts);
    if (db.length === 0)
      error ("No alignments found");
    if (db.length > 1)
      error ("More than one alignment found");
    return db[0];
  }

  const fromSeqIndex = (seqdata, names) => {
    let stock = new Stockholm()
    names = names || Object.keys(seqdata)  // specifying order is optional
    names.forEach ((name) => stock.addRow (name, seqdata[name]))
    return stock
  }

  const fromRowList = (array) => {
    let stock = new Stockholm()
    array.forEach ((row) => stock.addRow (row[0], row[1]))
    return stock
  }

  Stockholm.prototype.rows = function() {
    return this.seqname.length
  }

  Stockholm.prototype.columns = function() {
    let cols = 0
    this.seqname.forEach ((name) => { cols = Math.max (cols, this.seqdata[name].length) })
    Object.keys(this.gr).forEach ((tag) => Object.keys(this.gr[tag]).forEach ((name) => {
      cols = Math.max (cols, this.gr[tag][name].length)
    }))
    return cols
  }

  Stockholm.prototype.allNames = function() {
    let isName = {},
        names = [],
        addName = (name) => { if (!isName[name]) { isName[name] = true; names.push (name) } },
        addNames = (list) => list.forEach (addName);
    addNames (this.seqname);
    addNames (Object.keys (this.seqdata));  // just in case seqdata has been independently modified
    Object.keys(this.gr).forEach ((tag) => addNames (Object.keys(this.gr[tag])));
    Object.keys(this.gs).forEach ((tag) => addNames (Object.keys(this.gs[tag])));
    return names
  }

  Stockholm.prototype.allTags = function() {
    let isTag = {}
    const addTags = (obj) => Object.keys(obj).forEach ((tag) => isTag[tag] = true)
    addTags (this.gc)
    addTags (this.gf)
    addTags (this.gr)
    addTags (this.gs)
    return Object.keys(isTag).sort()
  }

  Stockholm.prototype.addRow = function (name, data) {
    if (this.seqdata[name])
      error ("Duplicate row name")
    this.seqname.push (name)
    this.seqdata[name] = data || ''
    return this
  }

  Stockholm.prototype.deleteRow = function (name) {
    if (!this.seqdata[name])
      error ("Row not found")
    this.seqname = this.seqname.filter ((n) => n !== name);
    delete this.seqdata[name];
    return this
  }

  function leftPad (text, width) {
    while (text.length < width)
      text = ' ' + text
    return text
  }

  function space (width) {
    return leftPad ("", width)
  }

  Stockholm.prototype.toString = function (opts) {
    opts = opts || { width: 80 }
    const names = this.allNames(), cols = this.columns()
    const nameWidth = Math.max.apply (null, names.map ((name) => name.length).concat([0]))
    const tagWidth = Math.max.apply (null, this.allTags().map ((tag) => tag.length).concat([0]))
    const seqIndent = tagWidth ? (tagWidth + 6) : 0;
    const width = opts.width ? Math.max (1, opts.width - nameWidth - seqIndent - 1) : cols
    let offsets = [0]
    for (let offset = width; offset < cols; offset += width)
      offsets.push (offset)
    return "# STOCKHOLM 1.0\n"
      + Object.keys(this.gf).sort().map (tag => this.gf[tag].map((line) => "#=GF " + leftPad(tag,tagWidth) + " " + line + "\n").join('')).join('')
      + Object.keys(this.gs).sort().map (tag => Object.keys(this.gs[tag]).map((name) => this.gs[tag][name].map ((line) => "#=GS " + leftPad(tag,tagWidth) + " " + leftPad(name,nameWidth) + " " + line + "\n").join('')).join('')).join('')
      + offsets.map ((offset) =>
                     Object.keys(this.gc).sort().map (tag => "#=GC " + leftPad(tag,tagWidth) + space(nameWidth+2) + this.gc[tag].substr(offset,width) + "\n").join('')
                     + names.map ((name) => Object.keys(this.gr).filter ((tag) => this.gr[tag][name]).sort().map ((tag) => "#=GR " + leftPad(tag,tagWidth) + " " + leftPad(name,nameWidth) + " " + this.gr[tag][name].substr(offset,width) + "\n").join('')
                                  + (this.seqdata[name]
                                     ? (leftPad(name,nameWidth+seqIndent) + " " + this.seqdata[name].substr(offset,width) + "\n")
                                     : '')).join('')).join("\n")
      + "//\n"
  }

  Stockholm.prototype.toFasta = function (opts) {
    opts = opts || { width: 80 }
    const cols = this.columns()
    const width = opts.width || cols
    let offsets = [0]
    for (let offset = width; offset < cols; offset += width)
      offsets.push (offset)
    return this.allNames()
      .map ((name) =>
            (this.seqdata[name]
             ? (">" + name + "\n"
                + offsets.map ((offset) => this.seqdata[name].substr (offset, width) + "\n").join(''))
             : ''))
      .join('')
  }

  Stockholm.prototype.toRowList = function (opts) {
    return this.allNames()
      .filter ((name) => this.seqdata[name])
      .map ((name) => [name, this.seqdata[name]])
  }

  return { sniff, validate, parse, parseAll, fromSeqIndex, fromRowList, Stockholm }
})()
