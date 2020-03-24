const Stockholm = require ('stockholm-js'),
      Newick = require ('newick-js'),
      JukesCantor = require ('jukes-cantor'),
      RapidNeighborJoining = require ('neighbor-joining'),
      pv = require('bio-pv')

const { render } = (() => {

  // colors
  const lilac = "#C8A2C8"  // nonstandard
  const colorScheme = {
    clustal: { G: "orange", P: "orange", S: "orange", T: "orange", H: "red", K: "red", R: "red", F: "blue", W: "blue", Y: "blue", I: "green", L: "green", M: "green", V: "green" },
    lesk: { G: "orange", A: "orange", S: "orange", T: "orange", C: "green", V: "green", I: "green", L: "green", P: "green", F: "green", Y: "green", M: "green", W: "green", N: "magenta", Q: "magenta", H: "magenta", D: "red", E: "red", K: "blue", R: "blue" },
    maeditor: { A: "lightgreen", G: "lightgreen", C: "green", D: "darkgreen", E: "darkgreen", N: "darkgreen", Q: "darkgreen", I: "blue", L: "blue", M: "blue", V: "blue", F: lilac, W: lilac, Y: lilac, H: "darkblue", K: "orange", R: "orange", P: "pink", S: "red", T: "red" },
    cinema: { H: "blue", K: "blue", R: "blue", D: "red", E: "red", S: "green", T: "green", N: "green", Q: "green", A: "white", V: "white", L: "white", I: "white", M: "white", F: "magenta", W: "magenta", Y: "magenta", P: "brown", G: "brown", C: "yellow", B: "gray", Z: "gray", X: "gray", "-": "gray", ".": "gray" }
  }
  const defaultColorScheme = "maeditor"
  const getColor = (c, color) => color[c.toUpperCase()] || color['default'] || 'black';

  // CSS
  const addStylesToDocument = (opts) => {
    const { columns, alignLayout } = opts
    const head = document.getElementsByTagName('head')[0]

    if (!document.getElementById ('tav-global-styles')) {
      const style = create ('style', head, null, { id: 'tav-global-styles', type: 'text/css' })
      style.innerHTML =
        ['.tav-hide { display: none; }',
         'div.tav-show, div.tav-anim { display: flex; }',
         '.tav-show span, span.tav-show { display: inline; }',
         '.tav-rows span { ' + makeStyle ({ width: alignLayout.charWidth,
                                            'min-width': alignLayout.charWidth }) + ' }',
         '.tav-rows .tav-show span:hover { border-style: solid; border-color: black; border-width: 1px; margin: -1px; }'
        ].join(' ')
    }

    let colStyle = []
    for (let col = 0; col < columns; ++col)
      colStyle.push (create ('style', head, null, { type: 'text/css' }))

    return colStyle
  }
  
  // summarize alignment
  const summarizeAlignment = (opts) => {
    const { rowData } = opts
    let alignColToSeqPos = {}, seqPosToAlignCol = {}, isChar = {}, columns
    Object.keys(rowData).forEach ((node) => {
      const row = rowData[node]
      if (typeof(columns) !== 'undefined' && columns != row.length)
        console.error ("Inconsistent row lengths")
      columns = row.length
      let pos2col = [], pos = 0
      alignColToSeqPos[node] = row.split('').map ((c, col) => {
        isChar[c] = true
        const isGap = isGapChar(c)
        if (!isGap)
          pos2col.push (col)
        return isGap ? pos : pos++
      })
      seqPosToAlignCol[node] = pos2col
    })
    const chars = Object.keys(isChar).sort()
    return { alignColToSeqPos, columns, chars }
  }

  const isGapChar = (c) => { return c == '-' || c == '.' }
  
  // summarize tree
  const summarizeTree = (opts) => {
    const { root, branches } = opts
    let children = {}, branchLength = {}
    children[root] = []
    branchLength[root] = 0
    branches.forEach ((branch) => {
      const parent = branch[0], child = branch[1], len = branch[2]
      children[parent] = children[parent] || []
      children[child] = children[child] || []
      children[parent].push (child)
      branchLength[child] = len
    })
    let nodes = [], nodeRank = {}, descendants = {}, distFromRoot = {}, maxDistFromRoot = 0
    const addNode = (node) => {
      if (!node)
        throw new Error ("All nodes must be named")
      if (nodeRank[node])
        throw new Error ("All node names must be unique (duplicate '" + node + "')")
      nodeRank[node] = nodes.length
      nodes.push (node)
    }
    const addSubtree = (node, parent) => {
      distFromRoot[node] = (typeof(parent) !== 'undefined' ? distFromRoot[parent] : 0) + branchLength[node]
      maxDistFromRoot = Math.max (maxDistFromRoot, distFromRoot[node])
      const kids = children[node]
      let clade = []
      if (kids.length == 2) {
        clade = clade.concat (addSubtree (kids[0], node))
        addNode (node)
        clade = clade.concat (addSubtree (kids[1], node))
      } else {
        addNode (node)
        kids.forEach ((child) => clade = clade.concat (addSubtree (child, node)))
      }
      descendants[node] = clade
      return [node].concat (clade)
    }
    addSubtree (root)
    return { root, branches, children, descendants, branchLength, nodes, nodeRank, distFromRoot, maxDistFromRoot }
  }

  // get tree collapsed/open state
  const getNodeVisibility = (opts) => {
    const { treeSummary, alignSummary, collapsed, forceDisplayNode, rowData } = opts
    let ancestorCollapsed = {}, nodeVisible = {}
    const setCollapsedState = (node, parent) => {
      ancestorCollapsed[node] = ancestorCollapsed[parent] || collapsed[parent]
      const kids = treeSummary.children[node]
      if (kids)
        kids.forEach ((child) => setCollapsedState (child, node))
    }
    setCollapsedState (treeSummary.root)
    treeSummary.nodes.forEach ((node) => nodeVisible[node] = (!ancestorCollapsed[node]
                                                              && (treeSummary.children[node].length === 0
                                                                  || forceDisplayNode[node])))
    let columnVisible = new Array(alignSummary.columns).fill(false)
    treeSummary.nodes.filter ((node) => nodeVisible[node]).forEach ((node) => {
      if (rowData[node])
        rowData[node].split('').forEach ((c, col) => { if (!isGapChar(c)) columnVisible[col] = true })
    })
    return { ancestorCollapsed, nodeVisible, columnVisible }
  }
  
  // layout tree
  const layoutTree = (opts) => {
    let { treeAlignState, treeConfig, containerHeight, treeSummary } = opts
    const { collapsed, nodeVisible, nodeScale } = treeAlignState
    const { genericRowHeight, nodeHandleRadius, treeStrokeWidth, availableTreeWidth, scrollbarHeight } = treeConfig
    let nx = {}, ny = {}, computedRowScale = [], nodeHeight = {}, rowHeight = [], treeHeight = 0
    const rowY = treeSummary.nodes.map ((node) => {
      const scale = typeof(nodeScale[node]) !== 'undefined' ? nodeScale[node] : 1
      const rh = scale * (nodeVisible[node] ? genericRowHeight : 0)
      const y = treeHeight
      nx[node] = nodeHandleRadius + treeStrokeWidth + availableTreeWidth * treeSummary.distFromRoot[node] / treeSummary.maxDistFromRoot
      ny[node] = y + rh / 2
      nodeHeight[node] = rh
      computedRowScale.push (scale)
      rowHeight.push (rh)
      treeHeight += rh
      return y
    })
    treeHeight += scrollbarHeight
    return { nx, ny, computedRowScale, nodeHeight, rowHeight, rowY, treeHeight }
  }

  // get metrics and other info about alignment font/chars, and do layout
  const layoutAlignment = (opts) => {
    const { treeSummary, alignSummary, treeAlignState, genericRowHeight, charFont, color } = opts
    const alignChars = alignSummary.chars
    let charWidth = 0, charMetrics = {}
    alignChars.forEach ((c) => {
      let measureCanvas = create ('canvas', null, null, { width: genericRowHeight, height: genericRowHeight })
      let measureContext = measureCanvas.getContext('2d')
      measureContext.font = charFont
      charMetrics[c] = measureContext.measureText (c)
      charWidth = Math.max (charWidth, Math.ceil (charMetrics[c].width))
    })
    const charHeight = genericRowHeight

    let nextColX = 0, colX = [], colWidth = [], computedColScale = []
    for (let col = 0; col < alignSummary.columns; ++col) {
      colX.push (nextColX)
      if (treeAlignState.columnVisible[col]) {
        let scale = treeAlignState.columnScale[col]
        if (typeof(scale) === 'undefined')
          scale = 1
        computedColScale.push (scale)
        const width = scale * charWidth
        colWidth.push (width)
        nextColX += width
      } else {
        computedColScale.push (0)
        colWidth.push (0)
      }
    }

    return { charMetrics, charWidth, charHeight, colX, colWidth, computedColScale, alignWidth: nextColX }
  }
  
  // render tree
  const renderTree = (opts) => {
    const { treeWidth, treeSummary, treeLayout, treeAlignState, treeConfig } = opts
    const { collapsed, ancestorCollapsed, forceDisplayNode, nodeScale } = treeAlignState
    const { branchStrokeStyle, treeStrokeWidth, rowConnectorDash, nodeHandleRadius, nodeHandleFillStyle, collapsedNodeHandleFillStyle } = treeConfig
    let { treeDiv } = opts
    const { nx, ny, treeHeight } = treeLayout
    treeDiv.innerHTML = ''
    let treeCanvas = create ('canvas', treeDiv, null, { width: treeWidth,
                                                        height: treeHeight }),
        ctx = treeCanvas.getContext('2d')
    ctx.strokeStyle = branchStrokeStyle
    ctx.lineWidth = treeStrokeWidth
    const makeNodeHandlePath = (node) => {
      ctx.beginPath()
      ctx.arc (nx[node], ny[node], nodeHandleRadius, 0, 2*Math.PI)
    }
    const setAlpha = (node) => {
      const scale = nodeScale[node]
      ctx.globalAlpha = (typeof(scale) === 'undefined' || forceDisplayNode[node]) ? 1 : scale
    }
    let nodesWithHandles = treeSummary.nodes.filter ((node) => !ancestorCollapsed[node] && treeSummary.children[node].length)
    treeSummary.nodes.forEach ((node) => {
      if (!ancestorCollapsed[node]) {
        if (!treeSummary.children[node].length) {
          setAlpha (node)
          ctx.setLineDash ([])
          ctx.beginPath()
          ctx.fillRect (nx[node], ny[node] - nodeHandleRadius, 1, 2*nodeHandleRadius)
        }
        if (treeSummary.children[node].length && !collapsed[node]) {
          ctx.setLineDash ([])
          treeSummary.children[node].forEach ((child) => {
            setAlpha (child)
            ctx.beginPath()
            ctx.moveTo (nx[node], ny[node])
            ctx.lineTo (nx[node], ny[child])
            ctx.lineTo (nx[child], ny[child])
            ctx.stroke()
          })
        }
        ctx.globalAlpha = 1
        if (treeSummary.children[node].length === 0 || forceDisplayNode[node]) {
          setAlpha (node)
          ctx.setLineDash (rowConnectorDash)
          ctx.beginPath()
          ctx.moveTo (nx[node], ny[node])
          ctx.lineTo (treeWidth, ny[node])
          ctx.stroke()
        }
      }
    })
    ctx.strokeStyle = branchStrokeStyle
    ctx.setLineDash ([])
    nodesWithHandles.forEach ((node) => {
      setAlpha (node)
      makeNodeHandlePath (node)
      // hack: collapsed[node]===false means that we are animating the open->collapsed transition
      // so the node's descendants are visible, but the node itself is rendered as collapsed
      if (collapsed[node] || (forceDisplayNode[node] && collapsed[node] !== false))
        ctx.fillStyle = collapsedNodeHandleFillStyle
      else {
        ctx.fillStyle = nodeHandleFillStyle
        ctx.stroke()
      }
      ctx.fill()
    })
    return { treeCanvas, nodesWithHandles, makeNodeHandlePath }
  }

  // create tree-alignment container DIVs
  let globalInstanceCount = 0   // so we can have multiple instances on a page, without CSS conflicts
  const createContainer = (opts) => {
    const { parent, dom, containerWidth, containerHeight, treeAlignHeight, structureConfig, treeWidth, treeHeight, alignSummary, alignLayout } = opts
    if (!dom.colStyle)
      dom.colStyle = addStylesToDocument ({ columns: alignSummary.columns, alignLayout })
    if (!dom.instanceClass)
      dom.instanceClass = 'tav-' + (++globalInstanceCount)
    let container = dom.container || create ('div', opts.parent,
                                             { display: 'flex',
                                               'flex-direction': 'column',
                                               width: containerWidth,
                                               height: containerHeight },
                                             { class: dom.instanceClass })
    
    let treeAlignDiv = dom.treeAlignDiv || create ('div', container,
                                                   { display: 'flex',
                                                     'flex-direction': 'row',
                                                     width: containerWidth,
                                                     'min-height': treeAlignHeight,
                                                     'overflow-y': 'auto',
                                                     'border-style': 'solid',
                                                     'border-color': 'black',
                                                     'border-width': '1px' })
    let treeDiv = dom.treeDiv || create ('div', treeAlignDiv)
    let alignDiv = dom.alignDiv || create ('div', treeAlignDiv)

    let structuresDiv = dom.structuresDiv || create ('div', container,
                                                   { display: 'flex',
                                                     'flex-direction': 'row',
                                                     width: containerWidth,
                                                     height: structureConfig.height })

    setStyle (treeDiv, { width: treeWidth + 'px',
                         height: treeHeight + 'px' })

    setStyle (alignDiv, { display: 'flex',
                          'flex-direction': 'row',
                          overflow: 'hidden',
                          height: treeHeight + 'px' })

    return { container, treeAlignDiv, structuresDiv, treeDiv, alignDiv }
  }

  // build (structure-linked) span for a name
  const buildNameSpan = (opts) => {
    const { name, nameFont, nameFontColor, nameDiv, structure, structureConfig, structureState, structuresDiv } = opts
    let nameSpan = create ('span', nameDiv)
    if (structure) {
      let nameAnchor = create ('a', nameSpan, null, { href: '#' })
      nameAnchor.addEventListener ('click', (evt) => {
        evt.preventDefault()
        loadStructure ({ node: name, structure, structureConfig, structureState, structuresDiv })
      })
      nameAnchor.innerText = name
    } else
      nameSpan.innerText = name
    return nameSpan
  }
  
  // build span for an alignment char
  const buildAlignCharSpan = (opts) => {
    const { alignLayout, className, color, c, handler, structureHandler, coords, rowDiv, genericRowHeight, dom } = opts
    const charMetrics = alignLayout.charMetrics[c]
    const col = getColor (c, color)
    let charSpan = create ('span', rowDiv,
                           { color: col },
                           { class: className })
    charSpan.innerText = c
    const handlers = [structureHandler, handler]
    charSpan.addEventListener ('click', (evt) => {
      if (dom.panning || dom.scrolling)
        dom.panning = dom.scrolling = false
      else
        handlers.filter ((h) => h.alignClick).forEach ((h) => h.alignClick (coords))
    })
    const handlerInfo = { mouseover: { name: 'alignMouseover' },
                          mouseout: { name: 'alignMouseout' } }
    Object.keys(handlerInfo).forEach ((evtType) => {
      const info = handlerInfo[evtType]
      const typeHandlers = handlers.filter ((h) => h[info.name])
      if (typeHandlers.length)
        charSpan.addEventListener (evtType, (evt) => {
          typeHandlers.forEach ((h) => {
            if (!dom.panning && !dom.scrolling)
              h[info.name] (coords)
          })
        })
    })
    return charSpan
  }
  
  // create alignment
  const buildAlignment = async (opts) => {
    const { rowData, structure, structureConfig, structureState, handler, fontConfig, genericRowHeight, alignLayout, nameDivWidth, nodeHeight, treeSummary, treeAlignState, alignSummary, dom, state, warn } = opts
    const { nameFont, nameFontSize, nameFontColor, charFont, charFontName } = fontConfig
    const { alignDiv, structuresDiv } = dom
    
    if (!dom.namesDiv) {   // first build?
      dom.namesDiv = create ('div', alignDiv,
                             { 'font-size': nameFontSize + 'px',
                               'margin-left': '2px',
                               'margin-right': '2px',
                               'overflow-x': 'auto',
                               'overflow-y': 'hidden',
                               'max-width': nameDivWidth + 'px',
                               'flex-shrink': 0,
                               'white-space': 'nowrap' })
      
      dom.rowsDiv = create ('div', alignDiv,
                            { position: 'relative',
                              'overflow-x': 'scroll',
                              'overflow-y': 'hidden',
                              'user-select': 'none',
                              '-moz-user-select': 'none',
                              '-webkit-user-select': 'none',
                              '-ms-user-select': 'none',
                              padding: '1px',
                              cursor: 'move' },
                            { class: 'tav-rows' })

      dom.rowsBackDiv = create ('div', dom.rowsDiv)
      
      attachDragHandlers ({ dom, state })

      // create the alignment names
      let nameDivList = [], nameSpanList = []
      const structureHandler = makeStructureHandler ({ structureState, alignSummary, rowData, dom })
      await treeSummary.nodes.reduce
      ((promise, node, row) =>
       promise.then (() => {
         
         log (warn, "Building row #" + (row+1) + "/" + treeSummary.nodes.length + ": " + node)

         const initClass = treeAlignState.nodeVisible[node] ? 'tav-show' : 'tav-hide'
         
         let nameDiv = create ('div', dom.namesDiv,
                               { height: nodeHeight[node] + 'px',
                                 'flex-direction': 'column',
                                 'justify-content': 'center' },
                               { class: initClass })

         nameDivList.push (nameDiv)
         
         nameSpanList.push (buildNameSpan ({ name: node, structure: structure[node], structureConfig, structureState, structuresDiv, nameFont, nameFontColor, nameDiv }))

/*         
         let rowDiv = create ('div', dom.rowsDiv,
                              { height: nodeHeight[node] + 'px' },
                              { class: initClass })

         rowDivList.push (rowDiv)

         if (rowData[node]) {
           let spanList = []
           rowData[node].split('').forEach ((c, col) => {
             const coords = { node,
                              row,
                              column: col,
                              seqPos: colToSeqPos && colToSeqPos[col],
                              c,
                              isGap: isGapChar(c) }

             const className = 'tav-col-' + col
             const span = buildAlignCharSpan ({ alignLayout, className, color: fontConfig.color, c, handler, structureHandler, coords, rowDiv, genericRowHeight, dom })
             colSpanList[col].push (span)
             spanList.push (span)
           })
           rowSpanList.push (spanList)
         } else {
           colSpanList.forEach ((col) => col.push (null))
           rowSpanList.push ([])
         }
*/

         return delayPromise (0)
       }),
       new Promise ((resolve) => resolve()))

      extend (dom, { nameDivList, nameSpanList })
    }
    return dom
  }

  // style alignment
  const styleAlignment = (opts) => {
    const { dom, treeSummary, treeLayout, treeAlignState, alignLayout } = opts
    const { nodeVisible, columnVisible, nodeScale, columnScale, prevState } = treeAlignState
    const { nodeHeight, treeHeight } = treeLayout
    const { alignWidth } = alignLayout

    updateStyle (dom.rowsBackDiv, { width: alignWidth,
                                    height: treeHeight })

    treeSummary.nodes.forEach ((node, row) => {
      const scale = nodeScale[node], prevScale = prevState.nodeScale[node]
      const newClass = getRowClass (nodeVisible[node], scale)
      const oldClass = getRowClass (prevState.nodeVisible[node], prevScale)
      if (newClass !== oldClass) {
        dom.nameDivList[row].setAttribute ('class', newClass)
//        dom.rowDivList[row].setAttribute ('class', newClass)
      }
      if (scale !== prevScale) {
        const newStyle = { height: nodeHeight[node] }
        if (typeof(scale) !== 'undefined' && scale != 1) {
          newStyle.transform = 'scale(1,' + scale +')'
          newStyle.opacity = scale
        } else
          newStyle.transform = newStyle.opacity = ''
        updateStyle (dom.nameDivList[row], newStyle)
//        updateStyle (dom.rowDivList[row], newStyle)
      }
    })

/*    
    dom.colSpanList.forEach ((colSpan, col) => {
      const newStyle = getColStyle (columnVisible[col], columnScale[col], alignLayout)
      const oldStyle = getColStyle (prevState.columnVisible[col], prevState.columnScale[col], alignLayout)
      if (newStyle != oldStyle) {
        const instanceSelector = '.' + dom.instanceClass + ' .tav-rows'
        const colSelector = '.tav-col-' + col
        dom.colStyle[col].innerText = (newStyle
                                       ? (instanceSelector + ' ' + colSelector + '{' + newStyle + '}')
                                       : '')
      }
    })
*/

    prevState.nodeVisible = extend ({}, nodeVisible)
    prevState.columnVisible = columnVisible.slice(0)
    prevState.nodeScale = extend ({}, nodeScale)
    prevState.columnScale = extend ({}, columnScale)
  }

  // CSS class of a row
  const getRowClass = (visible, scale) => {
    return (visible
            ? (typeof(scale) === 'undefined'
               ? 'tav-show'
               : 'tav-anim')
            : 'tav-hide')
  }

    /*
  // CSS class definition of a column
  const getColStyle = (visible, scale, alignLayout) => {
    let styles = (visible
                  ? (typeof(scale) === 'undefined'
                     ? {}
                     : { width: scale * alignLayout.charWidth,
                         'min-width': scale * alignLayout.charWidth,
                         transform: 'scale(' + scale + ',1)',
                         opacity: scale || 1 })
                  : { display: 'none' })
    return makeStyle (styles)
  }
*/

  // create structure mouseover/click handlers
  const defaultPdbChain = 'A'
  const mouseoverLabelDelay = 100
  const makeStructureHandler = (opts) => {
    const { structureState, alignSummary, rowData, dom } = opts
    const alignMouseover = (coords) => {
      setTimer (structureState, 'mouseover', mouseoverLabelDelay, () => {
        structureState.openStructures.forEach ((s) => {
          if (rowData[s.node] && !isGapChar(rowData[s.node][coords.column]) && s.viewer) {
            const colToSeqPos = alignSummary.alignColToSeqPos[s.node]
            if (colToSeqPos) {
              const seqPos = colToSeqPos[coords.column]
              const pdbSeqPos = seqPos + (typeof(s.structure.startPos) === 'undefined' ? 1 : s.structure.startPos)
              const pdbChain = s.structure.chain
              const residues = s.pdb.residueSelect ((res) => {
                return res.num() == pdbSeqPos
                  && (typeof(pdbChain) === 'undefined' || res.chain().name() == pdbChain)
              })
              if (residues) {
                const labelConfig = s.structure.labelConfig || { fontSize : 16,
                                                                 fontColor: '#f22',
                                                                 backgroundAlpha : 0.4 }
                if (s.hasMouseoverLabel)
                  s.viewer.rm ('mouseover')
                residues.eachResidue ((res) => {
                  s.viewer.label ('mouseover', res.qualifiedName(), res.centralAtom().pos(), labelConfig)
                })
                s.hasMouseoverLabel = true
              }
            }
          }
        })
      })
    }
    const alignMouseout = (coords) => {
      clearTimer (structureState, 'mouseover')
      structureState.openStructures.forEach ((s) => {
        if (s.hasMouseoverLabel) {
          s.viewer.rm ('mouseover')
          requestRedrawStructure (s)
          delete s.hasMouseoverLabel
        }
      })
    }
    return { alignMouseover, alignMouseout }
  }

  // generic timer methods
  const setTimer = (owner, name, delay, callback) => {
    owner.timer = owner.timer || {}
    clearTimer (owner, name)
    owner.timer[name] = window.setTimeout (() => {
      delete owner.timer[name]
      callback()
    }, delay)
  }

  const clearTimer = (owner, name) => {
    if (owner.timer && owner.timer[name]) {
      window.clearTimeout (owner.timer[name])
      delete owner.timer[name]
    }
  }
  
  // redraw request
  const redrawStructureDelay = 500
  const requestRedrawStructure = (structure) => {
    setTimer (structure, 'redraw', redrawStructureDelay, () => structure.viewer.requestRedrawStructure())
  }
  
  // create node-toggle handler
  const makeNodeClickHandler = (opts) => {
    const { treeSummary, alignSummary, rowData, handler, treeAlignState, renderOpts } = opts
    const { collapsed, nodeScale, columnScale, forceDisplayNode, nodeVisible, columnVisible } = treeAlignState
    const collapseAnimationFrames = 10
    const collapseAnimationDuration = 200
    const collapseAnimationMaxFrameSkip = 8
    return (node) => {
      if (!handler || !handler.nodeClick || handler.nodeClick (node)) {
        let framesLeft = collapseAnimationFrames
        const wasCollapsed = collapsed[node], newCollapsed = extend ({}, collapsed)
        if (wasCollapsed) {
          collapsed[node] = false  // when collapsed[node]=false, it's rendered by renderTree() as a collapsed node, but its descendants are still visible. A bit of a hack...
          delete newCollapsed[node]
        } else
          newCollapsed[node] = true
        const newViz = getNodeVisibility ({ treeSummary, alignSummary, collapsed: newCollapsed, forceDisplayNode, rowData })
        let newlyVisibleColumns = [], newlyHiddenColumns = []
        for (let col = 0; col < alignSummary.columns; ++col)
          if (newViz.columnVisible[col] !== columnVisible[col])
            (newViz.columnVisible[node] ? newlyVisibleColumns : newlyHiddenColumns).push (col)

        let lastFrameTime = Date.now()
        const expectedTimeBetweenFrames = collapseAnimationDuration / collapseAnimationFrames
        const drawAnimationFrame = () => {
          if (framesLeft) {
            const scale = (wasCollapsed ? (collapseAnimationFrames + 1 - framesLeft) : framesLeft) / (collapseAnimationFrames + 1)
            treeSummary.descendants[node].forEach ((desc) => { nodeScale[desc] = scale })
            nodeScale[node] = 1 - scale
            newlyHiddenColumns.forEach ((col) => columnScale[col] = scale)
            newlyVisibleColumns.forEach ((col) => columnScale[col] = 1 - scale)
            forceDisplayNode[node] = true
            renderOpts.state.disableTreeEvents = true
            renderOpts.state.animating = true
          } else {
            treeSummary.descendants[node].forEach ((desc) => { delete nodeScale[desc] })
            delete nodeScale[node]
            newlyHiddenColumns.forEach ((col) => delete columnScale[col])
            newlyVisibleColumns.forEach ((col) => delete columnScale[col])
            forceDisplayNode[node] = !wasCollapsed
            renderOpts.state.collapsed = newCollapsed
            renderOpts.state.disableTreeEvents = false
            renderOpts.state.animating = false
          }
          render (renderOpts)

          if (framesLeft) {
            const currentTime = Date.now(),
                  timeSinceLastFrame = currentTime - lastFrameTime,
                  timeToNextFrame = Math.max (0, expectedTimeBetweenFrames - timeSinceLastFrame),
                  frameSkip = Math.min (collapseAnimationMaxFrameSkip, Math.ceil (timeSinceLastFrame / expectedTimeBetweenFrames))
            framesLeft = Math.max (0, framesLeft - frameSkip)
            lastFrameTime = currentTime
            setTimeout (drawAnimationFrame, timeToNextFrame)
          }
        }

        drawAnimationFrame (collapseAnimationFrames)
      }
    }
  }
  
  // attach node-toggle handler
  const attachNodeToggleHandlers = (opts) => {
    const { treeAlignDiv, nodeClicked, treeCanvas, treeLayout, nodesWithHandles, nodeHandleClickRadius, collapsed } = opts
    const canvasRect = treeCanvas.getBoundingClientRect(),
          canvasOffset = { top: canvasRect.top + treeAlignDiv.scrollTop + document.body.scrollTop,  // this sort of thing absolutely terrifies me
                           left: canvasRect.left + document.body.scrollLeft }
    treeCanvas.addEventListener ('click', (evt) => {
      evt.preventDefault()
      const mouseX = parseInt (evt.clientX - canvasOffset.left)
      const mouseY = parseInt (evt.clientY - canvasOffset.top + treeAlignDiv.scrollTop + document.body.scrollTop)
//      console.warn ('evt.clientY', evt.clientY, 'canvasRect.top',canvasRect.top, 'treeAlignDiv.scrollTop',treeAlignDiv.scrollTop, 'document.body.scrollTop',document.body.scrollTop)
      let ctx = treeCanvas.getContext('2d')
      let closestNode, closestNodeDistSquared
      nodesWithHandles.forEach ((node) => {
        const distSquared = Math.pow (mouseX - treeLayout.nx[node], 2) + Math.pow (mouseY - treeLayout.ny[node], 2)
        if (typeof(closestNodeDistSquared) === 'undefined' || distSquared < closestNodeDistSquared) {
          closestNodeDistSquared = distSquared
          closestNode = node
        }
      })
      if (closestNode && closestNodeDistSquared <= Math.pow(nodeHandleClickRadius,2))
        nodeClicked (closestNode)
    })
  }

  // set scroll state
  const setScrollState = (opts) => {
    const { dom, state } = opts
    const { treeAlignDiv, rowsDiv } = dom
    const { scrollLeft, scrollTop } = state
    if (typeof(scrollLeft) !== 'undefined')
      rowsDiv.scrollLeft = scrollLeft
    if (typeof(scrollTop) !== 'undefined')
      treeAlignDiv.scrollTop = scrollTop
  }
  
  // attach drag handlers
  const attachDragHandlers = (opts) => {
    const { dom, state } = opts
    const { treeAlignDiv, rowsDiv } = dom
    let { scrollLeft, scrollTop } = state

    let startX, rowsDivMouseDown;
    rowsDiv.addEventListener("mousedown", e => {
      rowsDivMouseDown = true;
      rowsDiv.classList.add("active");
      startX = e.pageX - rowsDiv.offsetLeft;
      scrollLeft = rowsDiv.scrollLeft;
    });
    rowsDiv.addEventListener("mouseleave", () => {
      rowsDivMouseDown = false;
      rowsDiv.classList.remove("active");
      dom.panning = false
    });
    rowsDiv.addEventListener("mouseup", () => {
      rowsDivMouseDown = false;
      rowsDiv.classList.remove("active");
    });
    rowsDiv.addEventListener("mousemove", e => {
      if (!rowsDivMouseDown) return;
      e.preventDefault();
      const x = e.pageX - rowsDiv.offsetLeft;
      const walk = x - startX;
      rowsDiv.scrollLeft = scrollLeft - walk;
      dom.panning = true  // will be cleared by mouseleave or click
      delayedCanvasRedraw (dom, state)
    });
    rowsDiv.addEventListener("scroll", () => {
      delayedCanvasRedraw (dom, state)
    })

    let startY, containerMouseDown;
    treeAlignDiv.addEventListener("mousedown", e => {
      containerMouseDown = true;
      treeAlignDiv.classList.add("active");
      startY = e.pageY - treeAlignDiv.offsetTop;
      scrollTop = treeAlignDiv.scrollTop;
    });
    treeAlignDiv.addEventListener("mouseleave", () => {
      containerMouseDown = false;
      treeAlignDiv.classList.remove("active");
      dom.scrolling = false
    });
    treeAlignDiv.addEventListener("mouseup", () => {
      containerMouseDown = false;
      treeAlignDiv.classList.remove("active");
    });
    treeAlignDiv.addEventListener("mousemove", e => {
      if (!containerMouseDown) return;
      e.preventDefault();
      const y = e.pageY - treeAlignDiv.offsetTop;
      const walk = y - startY;
      treeAlignDiv.scrollTop = scrollTop - walk;
      dom.scrolling = true  // will be cleared by mouseleave or click
      delayedCanvasRedraw (dom, state)
    });
    treeAlignDiv.addEventListener("scroll", e => {
      delayedCanvasRedraw (dom, state)
    })

    window.addEventListener("resize", e => {
      delayedCanvasRedraw (dom, state)
    })
  }
  
  // render to canvas
  const drawVisibleAlignmentRegionToCanvas = (opts) => {
    const { canvas, top, left, treeSummary, treeLayout, alignSummary, rowData, fontConfig, alignLayout } = opts
    const bottom = top + canvas.height, right = left + canvas.width
    const ctx = canvas.getContext('2d')
    ctx.font = fontConfig.charFont
    let firstRow, lastRow  // firstRow is first (partially) visible row, lastRow is last (partially) visible row
    for (let row = firstRow = 0; row < treeLayout.rowHeight.length && treeLayout.rowY[row] < bottom; ++row) {
      if (treeLayout.rowY[row] < top)
        firstRow = row
      lastRow = row
    }
    let colX = 0
    for (let col = 0; col < alignSummary.columns && colX < right; ++col) {
      const xScale = alignLayout.computedColScale[col],
            colX = alignLayout.colX[col],
            width = alignLayout.colWidth[col]
      if (xScale && colX + width >= left)
        for (let row = firstRow; row <= lastRow; ++row) {
          const yScale = treeLayout.computedRowScale[row],
                rowY = treeLayout.rowY[row],
                height = treeLayout.rowHeight[row],
                seq = rowData[treeSummary.nodes[row]]
          if (height && seq) {
            ctx.setTransform (xScale, 0, 0, yScale, colX - left, rowY + height - top)
            const c = seq[col]
            ctx.fillStyle = getColor (c, fontConfig.color)
            ctx.globalAlpha = Math.min (xScale, yScale)
            ctx.fillText (c, 0, 0)
          }
        }
    }
  }

  // create the canvas and attach to the alignment
  const offscreenRatio = 1  // the proportion of the rendered view that is invisible, on each side. Total rendered area = visible area * (1 + 2 * offscreenRatio)^2
  const attachAlignCanvas = (opts) => {
    const { dom, treeSummary, treeLayout, alignSummary, rowData, fontConfig, alignLayout, state } = opts
    const { rowsDiv } = dom
    dom.redrawCanvas = () => {
      const visibleWidth = rowsDiv.offsetWidth, visibleHeight = rowsDiv.offsetHeight
      const offscreenWidth = offscreenRatio * visibleWidth, offscreenHeight = offscreenRatio * visibleHeight
      const scrollTop = state.scrollTop || 0,
            scrollLeft = state.scrollLeft || 0,
            top = Math.max (0, scrollTop - offscreenWidth),
            left = Math.max (0, scrollLeft - offscreenHeight),
            bottom = Math.min (treeLayout.treeHeight, scrollTop + visibleHeight + offscreenHeight),
            right = Math.min (alignLayout.alignWidth, scrollLeft + visibleWidth + offscreenWidth),
            width = right - left,
            height = bottom - top
      if (dom.canvas)
        dom.rowsDiv.removeChild (dom.canvas)
      const canvas = create ('canvas', rowsDiv,
                             { position: 'absolute',
                               overflow: 'hidden',
                               top,
                               left },
                             { width,
                               height })
      drawVisibleAlignmentRegionToCanvas ({ canvas, top, left, width, height, treeSummary, treeLayout, alignSummary, rowData, fontConfig, alignLayout })
      dom.canvas = canvas
    }
    dom.redrawCanvas()
  }

  // delayed canvas redraw
  const canvasRedrawDelay = 10
  const delayedCanvasRedraw = (dom, state) => {
    setTimer (dom, 'canvasRedraw', canvasRedrawDelay, () => {
      state.scrollTop = dom.treeAlignDiv.scrollTop
      state.scrollLeft = dom.rowsDiv.scrollLeft
      if (dom.redrawCanvas)
        dom.redrawCanvas()
    })
  }
  
  // load a PDB structure
  const loadStructure = (opts) => {
    const { node, structure, structureConfig, structureState, structuresDiv } = opts
    const { width, height } = structureConfig
    const newStructure = { node, structure }
    structureState.openStructures.push (newStructure)
    const pvDiv = create ('div', structuresDiv,
                          { width,
                            height,
                            position: 'relative',
                            'border-style': 'solid',
                            'border-color': 'black',
                            'border-width': '1px',
                            'padding-top': '2px',
                            margin: '1px' }),
          pvDivLabel = create ('div', pvDiv,
                               { position: 'absolute',
                                 top: '2px',
                                 left: '2px',
                                 'font-size': 'small' }),
          pvDivClose = create ('div', pvDiv,
                               { position: 'absolute',
                                 top: '2px',
                                 right: '2px',
                                 'font-size': 'small' }),
          pvDivCloseAnchor = create ('a', pvDivClose,
                                     null,
                                     { href: '#' })
    pvDivLabel.innerText = node
    pvDivCloseAnchor.innerText = 'close'
    pvDivCloseAnchor.addEventListener ('click', (evt) => {
      evt.preventDefault()
      structureState.openStructures = structureState.openStructures.filter ((s) => s !== newStructure)
      structuresDiv.removeChild (pvDiv)
    })
    
    const pvConfig = structureConfig.pvConfig
          || { width,
               height,
               antialias: true,
               quality : 'medium' }
    const viewer = pv.Viewer (pvDiv, pvConfig)
    const loadFromPDB = structureConfig.loadFromPDB
    const pdbFilePath = ((loadFromPDB
                          ? 'https://files.rcsb.org/download/'
                          : (structureConfig.pdbFilePrefix || ''))
                         + structure.pdbFile
                         + (loadFromPDB
                            ? '.pdb'
                            : (structureConfig.pdbFileSuffix || '')))
    pv.io.fetchPdb (pdbFilePath, (pdb) => {
      // display the protein as cartoon, coloring the secondary structure
      // elements in a rainbow gradient.
      viewer.cartoon('protein', pdb, { color : pv.color.ssSuccession() })
      viewer.centerOn(pdb)
      viewer.autoZoom()
      extend (newStructure, { pdb, viewer })
    })
  }
  
  // create DOM element
  const create = (type, parent, styles, attrs) => {
    const element = document.createElement (type)
    if (parent)
      parent.appendChild (element)
    if (attrs)
      Object.keys(attrs).filter ((attr) => typeof(attrs[attr]) !== 'undefined').forEach ((attr) => element.setAttribute (attr, attrs[attr]))
    if (styles)
      setStyle (element, styles)
    return element
  }

  // set CSS styles of DOM element
  const setStyle = (element, styles) => {
    element.setAttribute ('style', makeStyle (styles))
  }

  // make CSS style string
  const makeStyle = (styles) => {
    return Object.keys(styles).filter ((style) => styles[style] !== '').sort().reduce ((styleAttr, style) => styleAttr + style + ':' + styles[style] + ';', '')
  }
  
  // get CSS styles
  const getStyle = (element) => {
    let styles = {};
    (element.getAttribute('style') || '').split(';').forEach ((kv) => { if (kv) { const [k,v] = kv.split(':'); styles[k] = v } })
    return styles
  }

  // update CSS style
  const updateStyle = (element, styles) => {
    setStyle (element, extend (getStyle (element), styles))
  }

  // replace nth child of DOM element, or append if no nth child
  const replaceNthChild = (parent, n, newChild) => {
    if (parent.childElementCount <= n)
      parent.appendChild (newChild)
    else if (newChild !== parent.children[n]) {
      parent.insertBefore (newChild, parent.children[n])
      parent.removeChild (parent.children[n+1])
    }
  }

  // our friend, extend (limited version...)
  const extend = (a, b) => {
    Object.keys(b).forEach ((k) => a[k] = b[k])
    return a
  }

  // method to get data & build tree if necessary
  const pdbRegex = /PDB; +(\S+) +(\S); ([0-9]+)/;   /* PFAM format for embedding PDB IDs in Stockholm files */
  const getData = (data, config) => {
    const structure = data.structure = data.structure || {}
    if (!(data.root && data.branches && data.rowData)) {
      let newickStr = data.newick
      if (data.stockholm) {
        const stock = Stockholm.parse (data.stockholm)
        data.rowData = stock.seqdata
        if (stock.gf.NH && !newickStr)
          newickStr = stock.gf.NH.join('')
        if (stock.gs.DR && (config.loadFromPDB || (config.structure && config.structure.loadFromPDB)))
          Object.keys(stock.gs.DR).forEach ((node) => {
            stock.gs.DR[node].forEach ((dr) => {
              const match = pdbRegex.exec(dr)
              if (match)
                structure[node] = { pdbFile: match[1].toLowerCase(),
                                    chain: match[2],
                                    startPos: parseInt (match[3]),
                                    loadFromPDB: true }
            })
          })
      } else if (data.fasta)
        data.rowData = parseFasta (data.fasta)
      else
        throw new Error ("no sequence data")
      if (newickStr) {
        const newickTree = Newick.parse (newickStr)
        let nodes = 0
        const getName = (obj) => (obj.name = obj.name || ('node' + (++nodes)))
        data.branches = []
        const traverse = (parent) => {
          if (parent.branchset)
            parent.branchset.forEach ((child) => {
              data.branches.push ([getName(parent), getName(child), Math.max (child.length, 0)])
              traverse (child)
            })
        }
        traverse (newickTree)
        data.root = getName (newickTree)
      } else {
        const taxa = Object.keys(data.rowData).sort(), seqs = taxa.map ((taxon) => data.rowData[taxon])
        const distMatrix = JukesCantor.calcDistanceMatrix (seqs)
        const rnj = new RapidNeighborJoining.RapidNeighborJoining (distMatrix, taxa.map ((name) => ({ name })))
        log (config.warn, "Building neighbor-joining tree")
        rnj.run()
        const tree = rnj.getAsObject()
        let nodes = 0
        const getName = (obj) => { obj.taxon = obj.taxon || { name: 'node' + (++nodes) }; return obj.taxon.name }
        data.branches = []
        const traverse = (parent) => {
          parent.children.forEach ((child) => {
            data.branches.push ([getName(parent), getName(child), Math.max (child.length, 0)])
            traverse (child)
          })
        }
        traverse (tree)
        data.root = getName (tree)
      }
    }
    return data
  }

  // method to parse FASTA (simple enough to build in here)
  const parseFasta = (fasta) => {
    let seq = {}, name, re = /^>(\S+)/;
    fasta.split("\n").forEach ((line) => {
      const match = re.exec(line)
      if (match)
        seq[name = match[1]] = ''
      else if (name)
        seq[name] = seq[name] + line.replace(/[ \t]/g,'')
    })
    return seq
  }

  // logging
  const log = (warn, message) => {
    (warn || console.warn) (message)
  }

  // Promise delay
  const delayPromise = (delay) => {
    return new Promise ((resolve) => setTimeout (resolve, delay))
  }
  
  // main entry point
  const render = async (opts) => {
    // branches is a list of [parent,child,length]
    // rowData is a map of seqname->row
    // All nodes MUST be uniquely named!
    const { data } = opts
    const summary = opts.summary = opts.summary || {}
    const config = opts.config = opts.config || {}
    const state = opts.state = opts.state || {}
    const dom = opts.dom = opts.dom || {}

    const { root, branches, rowData } = getData (data, config)
    const structure = data.structure || {}

    const collapsed = state.collapsed = state.collapsed || {}
    const forceDisplayNode = state.forceDisplayNode = state.forceDisplayNode || {}
    const nodeScale = state.nodeScale = state.nodeScale || {}
    const columnScale = state.columnScale = state.columnScale || {}
    const disableTreeEvents = state.disableTreeEvents
    const prevState = state.prevState = state.prevState || { nodeVisible: {}, columnVisible: [], nodeScale: {}, columnScale: {} }
    const structureState = state.structure = state.structure || { openStructures: [] }

    // TODO: refactor default config into a single extend(defaultConfig,config)
    const parent = config.parent
    const warn = config.warn
    const treeAlignHeight = config.treeAlignHeight || 400
    const genericRowHeight = config.genericRowHeight || 24
    const nameFontSize = config.nameFontSize || 12
    const containerHeight = config.height || '100%'
    const containerWidth = config.width || '100%'
    const treeWidth = config.treeWidth || 200
    const nameDivWidth = config.nameDivWidth || 200
    const branchStrokeStyle = config.branchStrokeStyle || 'black'
    const nodeHandleStrokeStyle = branchStrokeStyle
    const nodeHandleRadius = config.nodeHandleRadius || 4
    const nodeHandleClickRadius = config.nodeHandleClickRadius || 4*nodeHandleRadius
    const nodeHandleFillStyle = config.nodeHandleFillStyle || 'white'
    const collapsedNodeHandleFillStyle = config.collapsedNodeHandleFillStyle || 'black'
    const rowConnectorDash = config.rowConnectorDash || [2,2]
    const structureConfig = config.structure || { width: 300, height: 300 }
    
    const handler = config.handler || {}
    const color = config.color || colorScheme[config.colorScheme || defaultColorScheme]
    
    const treeStrokeWidth = 1
    const availableTreeWidth = treeWidth - nodeHandleRadius - 2*treeStrokeWidth

    const charFontName = 'Menlo,monospace'
    const nameFontName = 'serif'
    const nameFontColor = 'black'
    const scrollbarHeight = 20  // hack, could be platform-dependent, a bit fragile...
    
    const charFont = genericRowHeight + 'px ' + charFontName
    const nameFont = nameFontSize + 'px ' + nameFontName
    
    const treeConfig = { treeWidth, availableTreeWidth, genericRowHeight, branchStrokeStyle, nodeHandleStrokeStyle, nodeHandleRadius, nodeHandleFillStyle, collapsedNodeHandleFillStyle, rowConnectorDash, treeStrokeWidth, scrollbarHeight }
    const fontConfig = { charFont, charFontName, color, nameFont, nameFontName, nameFontSize, nameFontColor }

    // analyze tree & alignment
    const treeSummary = summary.treeSummary = summary.treeSummary || summarizeTree ({ root, branches, collapsed })
    const alignSummary = summary.alignSummary = summary.alignSummary || summarizeAlignment ({ rowData })

    // get tree layout
    const { ancestorCollapsed, nodeVisible, columnVisible } = getNodeVisibility ({ treeSummary, alignSummary, collapsed, forceDisplayNode, rowData })
    const treeAlignState = { collapsed, ancestorCollapsed, forceDisplayNode, nodeVisible, columnVisible, nodeScale, columnScale, prevState }
    const treeLayout = layoutTree ({ treeAlignState, treeConfig, treeSummary, containerHeight })
    const { nx, ny, nodeHeight, treeHeight } = treeLayout

    // get alignment metrics
    const alignLayout = layoutAlignment ({ treeSummary, alignSummary, treeAlignState, genericRowHeight, charFont, color, treeAlignState })
    const { charWidth, charHeight } = alignLayout
    
    // create the tree & alignment container DIVs
    let { container, treeAlignDiv, treeDiv, alignDiv, structuresDiv } = createContainer ({ parent, dom, containerWidth, containerHeight, treeAlignHeight, treeWidth, treeHeight, structureConfig, alignSummary, alignLayout })
    extend (dom, { container, treeAlignDiv, treeDiv, alignDiv, structuresDiv })

    // render the tree
    const { treeCanvas, makeNodeHandlePath, nodesWithHandles } = renderTree ({ treeWidth, treeSummary, treeLayout, treeAlignState, treeConfig, treeDiv })

    // build the alignment
    let { namesDiv, rowsDiv, rebuilt } = await buildAlignment ({ rowData, dom, structure, warn, structureConfig, structureState, handler, fontConfig, genericRowHeight, nameDivWidth, nodeHeight, alignLayout, treeSummary, alignSummary, treeAlignState, state })
    extend (dom, { namesDiv, rowsDiv })

    // style the alignment
    styleAlignment ({ dom, treeSummary, treeLayout, treeAlignState, alignLayout })

    // attach the canvas
    attachAlignCanvas ({ dom, treeSummary, treeLayout, alignSummary, rowData, fontConfig, alignLayout, state })
   
    // set scroll state
    setScrollState ({ dom, state })

    // attach event handlers
    if (!disableTreeEvents) {
      const nodeClicked = makeNodeClickHandler ({ treeSummary, alignSummary, rowData, handler, treeAlignState, renderOpts: opts })
      attachNodeToggleHandlers ({ treeAlignDiv, nodeClicked, treeCanvas, nodesWithHandles, treeLayout, nodeHandleClickRadius, collapsed })
    }
    
    return { element: container }
  }

  return { render }
})()

if (typeof(module) !== 'undefined')
  module.exports = { render }
