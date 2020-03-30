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
  
  // index alignment
  const indexAlignment = (opts) => {
    const { data } = opts
    const { rowData } = data
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

  // helper to recognize gap characters
  const isGapChar = (c) => { return c == '-' || c == '.' }

  // get the root node(s) of a list of [parent,child,length] branches
  const getRoots = (branches) => {
    const isNode = {}, hasParent = {}
    branches.forEach ((branch) => {
      const [p, c] = branch
      isNode[p] = isNode[c] = hasParent[c] = true
    })
    return Object.keys(isNode).filter ((n) => !hasParent[n]).sort()
  }
  
  // index tree
  const indexTree = (opts) => {
    const { data } = opts
    const { branches } = data
    let { root } = data, rootSpecified = typeof(root) !== 'undefined'
    const roots = getRoots (branches)
    if (roots.length == 0 && (branches.length > 0 || !rootSpecified))
      throw new Error ("No root nodes")
    if (rootSpecified) {
      if (roots.indexOf(root) < 0)
        throw new Error ("Specified root node is not a root")
    } else {
      if (roots.length != 1)
        throw new Error ("Multiple possible root nodes, and no root specified")
      root = roots[0]
    }
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
    let nodes = [], seenNode = {}, descendants = {}, distFromRoot = {}, maxDistFromRoot = 0
    const addNode = (node) => {
      if (!node)
        throw new Error ("All nodes must be named")
      if (seenNode[node])
        throw new Error ("All node names must be unique (duplicate '" + node + "')")
      seenNode[node] = true
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
    return { root, branches, children, descendants, branchLength, nodes, distFromRoot, maxDistFromRoot }
  }

  // get tree collapsed/open state
  const getNodeVisibility = (opts) => {
    const { treeIndex, alignIndex, state, data } = opts
    const { collapsed, forceDisplayNode } = state
    const { rowData } = data
    let ancestorCollapsed = {}, nodeVisible = {}
    const setCollapsedState = (node, parent) => {
      ancestorCollapsed[node] = ancestorCollapsed[parent] || collapsed[parent]
      const kids = treeIndex.children[node]
      if (kids)
        kids.forEach ((child) => setCollapsedState (child, node))
    }
    setCollapsedState (treeIndex.root)
    treeIndex.nodes.forEach ((node) => nodeVisible[node] = (!ancestorCollapsed[node]
                                                              && (treeIndex.children[node].length === 0
                                                                  || forceDisplayNode[node])))
    let columnVisible = new Array(alignIndex.columns).fill(false)
    treeIndex.nodes.filter ((node) => nodeVisible[node]).forEach ((node) => {
      if (rowData[node])
        rowData[node].split('').forEach ((c, col) => { if (!isGapChar(c)) columnVisible[col] = true })
    })
    return { ancestorCollapsed, nodeVisible, columnVisible }
  }
  
  // layout tree
  const layoutTree = (opts) => {
    let { computedState, computedTreeConfig, treeIndex, config } = opts
    const { containerHeight } = config
    const { collapsed, nodeVisible, nodeScale } = computedState
    const { genericRowHeight, nodeHandleRadius, treeStrokeWidth, availableTreeWidth, scrollbarHeight } = computedTreeConfig
    let nx = {}, ny = {}, computedRowScale = [], nodeHeight = {}, rowHeight = [], treeHeight = 0
    const rowY = treeIndex.nodes.map ((node) => {
      const scale = typeof(nodeScale[node]) !== 'undefined' ? nodeScale[node] : 1
      const rh = scale * (nodeVisible[node] ? genericRowHeight : 0)
      const y = treeHeight
      nx[node] = nodeHandleRadius + treeStrokeWidth + availableTreeWidth * treeIndex.distFromRoot[node] / treeIndex.maxDistFromRoot
      ny[node] = y + rh / 2
      nodeHeight[node] = rh
      computedRowScale.push (scale)
      rowHeight.push (rh)
      treeHeight += rh
      return y
    })
    treeHeight += scrollbarHeight
    return { nx, ny, computedRowScale, nodeHeight, rowHeight, rowY, treeHeight, computedState }
  }

  // get metrics and other info about alignment font/chars, and do layout
  const layoutAlignment = (opts) => {
    const { treeIndex, alignIndex, computedState, computedFontConfig } = opts
    const { genericRowHeight, charFont, color } = computedFontConfig
    const alignChars = alignIndex.chars
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
    for (let col = 0; col < alignIndex.columns; ++col) {
      colX.push (nextColX)
      if (computedState.columnVisible[col]) {
        let scale = computedState.columnScale[col]
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
    const { treeIndex, treeLayout, computedState, computedTreeConfig, dom } = opts
    const { collapsed, ancestorCollapsed, forceDisplayNode, nodeScale } = computedState
    const { treeWidth, branchStrokeStyle, treeStrokeWidth, rowConnectorDash, nodeHandleRadius, nodeHandleFillStyle, collapsedNodeHandleFillStyle } = computedTreeConfig
    let { treeDiv } = dom
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
    let nodesWithHandles = treeIndex.nodes.filter ((node) => !ancestorCollapsed[node] && treeIndex.children[node].length)
    treeIndex.nodes.forEach ((node) => {
      if (!ancestorCollapsed[node]) {
        if (!treeIndex.children[node].length) {
          setAlpha (node)
          ctx.setLineDash ([])
          ctx.beginPath()
          ctx.fillRect (nx[node], ny[node] - nodeHandleRadius, 1, 2*nodeHandleRadius)
        }
        if (treeIndex.children[node].length && !collapsed[node]) {
          ctx.setLineDash ([])
          treeIndex.children[node].forEach ((child) => {
            setAlpha (child)
            ctx.beginPath()
            ctx.moveTo (nx[node], ny[node])
            ctx.lineTo (nx[node], ny[child])
            ctx.lineTo (nx[child], ny[child])
            ctx.stroke()
          })
        }
        ctx.globalAlpha = 1
        if (treeIndex.children[node].length === 0 || forceDisplayNode[node]) {
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
    extend (dom, { treeCanvas, nodesWithHandles, makeNodeHandlePath })
  }

  // create tree-alignment container DIVs
  let globalInstanceCount = 0   // so we can have multiple instances on a page, without CSS conflicts
  const createContainer = (opts) => {
    const { dom, config, treeLayout, alignIndex, alignLayout } = opts
    const { parent, containerWidth, containerHeight, treeAlignHeight, treeWidth } = config
    const { treeHeight } = treeLayout
    const structureConfig = config.structure || {}
    if (!dom.colStyle)
      dom.colStyle = addStylesToDocument ({ columns: alignIndex.columns, alignLayout })
    if (!dom.instanceClass)
      dom.instanceClass = 'tav-' + (++globalInstanceCount)
    let container = dom.container || create ('div', parent,
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

    extend (dom, { container, treeAlignDiv, structuresDiv, treeDiv, alignDiv })
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

  // create alignment
  const buildAlignment = (opts) => {
    const { data, computedFontConfig, alignLayout, treeLayout, treeIndex, alignIndex, computedState, dom, getState, config } = opts
    const state = getState()
    const { rowData } = data
    const structure = data.structure || {}, structureState = state.structure, structureConfig = config.structure || {}
    const { nameDivWidth, warn } = config
    const { nodeHeight } = treeLayout
    const { nameFont, nameFontSize, nameFontColor, charFont, charFontName, genericRowHeight } = computedFontConfig
    const { alignDiv, structuresDiv } = dom
    
    if (!dom.namesDiv) {   // first build?
      // create containers
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

      dom.rowsBackDiv = create ('div', dom.rowsDiv,
                                { 'z-index': 1 })

      // attach event handlers
      attachDragHandlers ({ dom, getState })
      attachAlignHandlers ({ dom, config })

      // add the alignment names
      let nameDivList = [], nameSpanList = []
      dom.alignHandler.structure = makeStructureHandler ({ structureState, alignIndex, rowData, dom })
      
      treeIndex.nodes.forEach ((node, row) => {
        log (warn, "Building row #" + (row+1) + "/" + treeIndex.nodes.length + ": " + node)
        
        const initClass = computedState.nodeVisible[node] ? 'tav-show' : 'tav-hide'
         
        let nameDiv = create ('div', dom.namesDiv,
                              { height: nodeHeight[node] + 'px',
                                'flex-direction': 'column',
                                'justify-content': 'center' },
                              { class: initClass })
        
        nameDivList.push (nameDiv)
        nameSpanList.push (buildNameSpan ({ name: node, structure: structure[node], structureConfig, structureState, structuresDiv, nameFont, nameFontColor, nameDiv }))
      })

      extend (dom, { nameDivList, nameSpanList })
    }
  }

  // style alignment
  const styleAlignment = (opts) => {
    const { dom, treeIndex, treeLayout, computedState, alignLayout } = opts
    const { nodeVisible, columnVisible, nodeScale, columnScale } = computedState
    const { nodeHeight, treeHeight } = treeLayout
    const { alignWidth } = alignLayout

    updateStyle (dom.rowsBackDiv, { width: alignWidth,
                                    height: treeHeight })

    treeIndex.nodes.forEach ((node, row) => {
      const scale = nodeScale[node]
      const newClass = getRowClass (nodeVisible[node], scale)
      dom.nameDivList[row].setAttribute ('class', newClass)
      const newStyle = { height: nodeHeight[node] }
      if (typeof(scale) !== 'undefined' && scale != 1) {
        newStyle.transform = 'scale(1,' + scale +')'
        newStyle.opacity = scale
      } else
        newStyle.transform = newStyle.opacity = ''
      updateStyle (dom.nameDivList[row], newStyle)
    })
  }

  // CSS class of a row
  const getRowClass = (visible, scale) => {
    return (visible
            ? (typeof(scale) === 'undefined'
               ? 'tav-show'
               : 'tav-anim')
            : 'tav-hide')
  }

  // create structure mouseover/click handlers
  const defaultPdbChain = 'A'
  const mouseoverLabelDelay = 100
  const makeStructureHandler = (opts) => {
    const { structureState, alignIndex, rowData, dom } = opts
    const mouseover = (coords) => {
      setTimer (structureState, 'mouseover', mouseoverLabelDelay, () => {
        structureState.openStructures.forEach ((s) => {
          if (rowData[s.node] && !isGapChar(rowData[s.node][coords.column]) && s.viewer) {
            const colToSeqPos = alignIndex.alignColToSeqPos[s.node]
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
    const mouseout = (coords) => {
      clearTimer (structureState, 'mouseover')
      structureState.openStructures.forEach ((s) => {
        if (s.hasMouseoverLabel) {
          s.viewer.rm ('mouseover')
          requestRedrawStructure (s)
          delete s.hasMouseoverLabel
        }
      })
    }
    return { mouseover, mouseout }
  }

  // set generic timer
  const setTimer = (owner, name, delay, callback) => {
    owner.timer = owner.timer || {}
    clearTimer (owner, name)
    owner.timer[name] = window.setTimeout (() => {
      delete owner.timer[name]
      callback()
    }, delay)
  }

  // clear generic timer
  const clearTimer = (owner, name) => {
    if (owner.timer && owner.timer[name]) {
      window.clearTimeout (owner.timer[name])
      delete owner.timer[name]
    }
  }
  
  // redraw request
  const redrawStructureDelay = 500
  const requestRedrawStructure = (structure) => {
    setTimer (structure, 'redraw', redrawStructureDelay, () => structure.viewer.requestRedraw())
  }
  
  // create node-toggle handler
  const makeNodeClickHandler = (opts) => {
    const { treeIndex, alignIndex, computedState, renderOpts } = opts
    const { rowData } = renderOpts.data
    const { handler } = renderOpts.config
    const { collapsed, nodeScale, columnScale, forceDisplayNode, nodeVisible, columnVisible } = computedState
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
        const newViz = getNodeVisibility ({ treeIndex, alignIndex, state: { collapsed: newCollapsed, forceDisplayNode }, data: { rowData } })
        let newlyVisibleColumns = [], newlyHiddenColumns = []
        for (let col = 0; col < alignIndex.columns; ++col)
          if (newViz.columnVisible[col] !== columnVisible[col])
            (newViz.columnVisible[node] ? newlyVisibleColumns : newlyHiddenColumns).push (col)

        let lastFrameTime = Date.now()
        const expectedTimeBetweenFrames = collapseAnimationDuration / collapseAnimationFrames
        const drawAnimationFrame = () => {
          if (framesLeft) {
            const scale = (wasCollapsed ? (collapseAnimationFrames + 1 - framesLeft) : framesLeft) / (collapseAnimationFrames + 1)
            treeIndex.descendants[node].forEach ((desc) => { nodeScale[desc] = scale })
            nodeScale[node] = 1 - scale
            newlyHiddenColumns.forEach ((col) => columnScale[col] = scale)
            newlyVisibleColumns.forEach ((col) => columnScale[col] = 1 - scale)
            forceDisplayNode[node] = true
            renderOpts.state.disableTreeEvents = true
            renderOpts.state.animating = true
          } else {
            treeIndex.descendants[node].forEach ((desc) => { delete nodeScale[desc] })
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
  const attachTreeHandlers = (opts) => {
    const { dom, treeLayout, computedTreeConfig, state, nodeClicked } = opts
    const { treeAlignDiv, treeCanvas, nodesWithHandles } = dom
    const { nodeHandleClickRadius } = computedTreeConfig
    const { collapsed } = state
    treeCanvas.addEventListener ('click', (evt) => {
      evt.preventDefault()
      const mouseX = parseInt (evt.offsetX)
      const mouseY = parseInt (evt.offsetY)
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
    const { dom, getState } = opts
    const { container, treeAlignDiv, rowsDiv } = dom
    const state = getState()
    let { scrollLeft, scrollTop } = state

    let startX, rowsDivMouseDown;
    rowsDiv.addEventListener("mousedown", e => {
      rowsDivMouseDown = true;
      startX = e.pageX - rowsDiv.offsetLeft;
      scrollLeft = rowsDiv.scrollLeft;
    });
    window.addEventListener("mouseleave", () => {
      rowsDivMouseDown = false;
      dom.panning = false
    });
    window.addEventListener("mouseup", () => {
      rowsDivMouseDown = false;
    });
    window.addEventListener("mousemove", e => {
      if (!rowsDivMouseDown) return;
      e.preventDefault();
      const x = e.pageX - rowsDiv.offsetLeft;
      const walk = x - startX;
      rowsDiv.scrollLeft = scrollLeft - walk;
      dom.panning = true  // will be cleared by mouseleave or click
      delayedCanvasRedraw (dom, getState())
    });
    rowsDiv.addEventListener("scroll", () => {
      delayedCanvasRedraw (dom, getState())
    })

    let startY, treeAlignMouseDown;
    treeAlignDiv.addEventListener("mousedown", e => {
      treeAlignMouseDown = true;
      startY = e.pageY - treeAlignDiv.offsetTop;
      scrollTop = treeAlignDiv.scrollTop;
    });
    window.addEventListener("mouseleave", () => {
      treeAlignMouseDown = false;
      dom.scrolling = false
    });
    window.addEventListener("mouseup", () => {
      treeAlignMouseDown = false;
    });
    window.addEventListener("mousemove", e => {
      if (!treeAlignMouseDown) return;
      e.preventDefault();
      const y = e.pageY - treeAlignDiv.offsetTop;
      const walk = y - startY;
      treeAlignDiv.scrollTop = scrollTop - walk;
      dom.scrolling = true  // will be cleared by mouseleave or click
      delayedCanvasRedraw (dom, getState())
    });
    treeAlignDiv.addEventListener("scroll", e => {
      delayedCanvasRedraw (dom, getState())
    })

    window.addEventListener("resize", e => {
      delayedCanvasRedraw (dom, getState())
    })
  }

  // attach mouseover/click handlers
  const attachAlignHandlers = (opts) => {
    const { dom, config } = opts
    dom.alignHandler = { user: config.handler }
    dom.rowsBackDiv.addEventListener ("click", evt => {
      if (!dom.scrolling && !dom.panning)
        callAlignHandler (evt, dom, dom.resolveAlignCoords (evt), "click")
      dom.scrolling = dom.panning = false
    })
    let lastCoords
    dom.rowsBackDiv.addEventListener ("mousemove", evt => {
      if (!dom.scrolling && !dom.panning) {
        const coords = dom.resolveAlignCoords (evt)
        if (!lastCoords || coords.row !== lastCoords.row || coords.column !== lastCoords.column) {
          if (lastCoords)
            callAlignHandler (evt, dom, lastCoords, "mouseout")
          callAlignHandler (evt, dom, coords, "mouseover")
          lastCoords = coords
        }
      }
    })
    dom.rowsBackDiv.addEventListener ("mouseleave", evt => {
      if (lastCoords)
        callAlignHandler (evt, dom, lastCoords, "mouseout")
      lastCoords = null
    })
  }

  // call mouseover/click handlers
  const callAlignHandler = (evt, dom, coords, type) => {
    const handler = dom.alignHandler
    Object.keys(handler).forEach ((k) => handler[k][type] && handler[k][type](coords))
  }
  
  // update mouseover/click event handlers
  const updateAlignHandlers = (opts) => {
    const { dom, treeIndex, alignIndex, rowData, alignLayout, treeLayout } = opts
    const { rowsDiv, treeAlignDiv } = dom
    dom.resolveAlignCoords = makeResolveAlignCoords ({ treeIndex, alignIndex, treeLayout, alignLayout, rowData })
  }

  // create function to resolve coords of alignment mouse event
  const makeResolveAlignCoords = (opts) => {
    const { treeIndex, alignIndex, treeLayout, alignLayout, rowData } = opts
    return (evt) => {
      const x = parseInt (evt.offsetX),
            y = parseInt (evt.offsetY)
      let row, column
      for (row = 0; row < treeIndex.nodes.length - 1; ++row)
        if (treeLayout.rowY[row] <= y && treeLayout.rowY[row] + treeLayout.rowHeight[row] > y)
          break
      for (column = 0; column < alignIndex.columns - 1; ++column)
        if (alignLayout.colX[column] <= x && alignLayout.colX[column] + alignLayout.colWidth[column] > x)
          break
      const node = treeIndex.nodes[row],
            colToSeqPos = alignIndex.alignColToSeqPos[node],
            seqPos = colToSeqPos && colToSeqPos[column],
            seq = rowData[node],
            c = seq && seq[column],
            isGap = isGapChar(c)
      return { row, column, node, seqPos, c, isGap }
    }
  }

  // render to canvas
  const drawVisibleAlignmentRegionToCanvas = (opts) => {
    const { canvas, top, left, treeIndex, treeLayout, alignIndex, rowData, computedFontConfig, alignLayout } = opts
    const bottom = top + canvas.height, right = left + canvas.width
    const ctx = canvas.getContext('2d')
    ctx.font = computedFontConfig.charFont
    let firstRow, lastRow  // firstRow is first (partially) visible row, lastRow is last (partially) visible row
    for (let row = firstRow = 0; row < treeLayout.rowHeight.length && treeLayout.rowY[row] < bottom; ++row) {
      if (treeLayout.rowY[row] < top)
        firstRow = row
      lastRow = row
    }
    let colX = 0
    for (let col = 0; col < alignIndex.columns && colX < right; ++col) {
      const xScale = alignLayout.computedColScale[col],
            colX = alignLayout.colX[col],
            width = alignLayout.colWidth[col]
      if (xScale && colX + width >= left)
        for (let row = firstRow; row <= lastRow; ++row) {
          const yScale = treeLayout.computedRowScale[row],
                rowY = treeLayout.rowY[row],
                height = treeLayout.rowHeight[row],
                seq = rowData[treeIndex.nodes[row]]
          if (height && seq) {
            ctx.setTransform (xScale, 0, 0, yScale, colX - left, rowY + height - top)
            const c = seq[col]
            ctx.fillStyle = getColor (c, computedFontConfig.color)
            ctx.globalAlpha = Math.min (xScale, yScale)
            ctx.fillText (c, 0, 0)
          }
        }
    }
  }

  // create the canvas and attach to the alignment
  const offscreenRatio = 1  // the proportion of the rendered view that is invisible, on each side. Total rendered area = visible area * (1 + 2 * offscreenRatio)^2
  const attachAlignCanvas = (opts) => {
    const { dom, treeIndex, treeLayout, alignIndex, data, computedFontConfig, alignLayout, getState } = opts
    const { rowData } = data
    const { rowsDiv } = dom
    // create a "redrawCanvas" method for scrolling. This is a little hacky/nonideal: every other redraw goes through the main render() method.
    // There's no real reason why this redraw shouldn't also go through render(), except then we'd need to check whether the tree or alignment had changed, and only redraw the part that had.
    // Yes, I am aware this is EXACTLY what React does...
    dom.redrawCanvas = () => {
      const visibleWidth = rowsDiv.offsetWidth, visibleHeight = rowsDiv.offsetHeight
      const offscreenWidth = offscreenRatio * visibleWidth, offscreenHeight = offscreenRatio * visibleHeight
      const state = getState()
      const scrollTop = state.scrollTop,
            scrollLeft = state.scrollLeft,
            top = Math.max (0, scrollTop - offscreenWidth),
            left = Math.max (0, scrollLeft - offscreenHeight),
            bottom = Math.min (treeLayout.treeHeight, scrollTop + visibleHeight + offscreenHeight),
            right = Math.min (alignLayout.alignWidth, scrollLeft + visibleWidth + offscreenWidth),
            width = right - left,
            height = bottom - top
      if (dom.alignCanvas)
        dom.rowsDiv.removeChild (dom.alignCanvas)
      const canvas = create ('canvas', rowsDiv,
                             { position: 'absolute',
                               overflow: 'hidden',
                               'pointer-events': 'none',
                               top,
                               left },
                             { width,
                               height })
      drawVisibleAlignmentRegionToCanvas ({ canvas, top, left, width, height, treeIndex, treeLayout, alignIndex, rowData, computedFontConfig, alignLayout })
      dom.alignCanvas = canvas

      updateAlignHandlers ({ dom, treeIndex, alignIndex, rowData, alignLayout, treeLayout })
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
  const extend = function() {
    let a = arguments[0]
    Array.from(arguments).slice(1).forEach ((b) => Object.keys(b).forEach ((k) => a[k] = b[k]))
    return a
  }

  // method to get data & build tree if necessary
  const pdbRegex = /PDB; +(\S+) +(\S); ([0-9]+)/;   /* PFAM format for embedding PDB IDs in Stockholm files */
  const getData = (data, config) => {
    const structure = data.structure = data.structure || {}
    if (!(data.branches && data.rowData)) {
      let newickStr = data.newick  // was a Newick-format tree specified?
      if (data.stockholm) {  // was a Stockholm-format alignment specified?
        const stock = Stockholm.parse (data.stockholm)
        data.rowData = stock.seqdata
        if (stock.gf.NH && !newickStr)  // did the Stockholm alignment include a tree?
          newickStr = stock.gf.NH.join('')
        if (stock.gs.DR && (config.loadFromPDB || (config.structure && config.structure.loadFromPDB)))  // did the Stockholm alignment include links to PDB?
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
      } else if (data.fasta)  // was a FASTA-format alignment specified
        data.rowData = parseFasta (data.fasta)
      else
        throw new Error ("no sequence data")
      // If a Newick-format tree was specified somehow (as a separate data item, or in the Stockholm alignment) then parse it
      if (newickStr) {
        const newickTree = Newick.parse (newickStr)
        let nodes = 0
        const getName = (obj) => (obj.name = obj.name || ('node' + (++nodes)))
        data.branches = []
        const traverse = (parent) => {  // auto-name internal nodes
          if (parent.branchset)
            parent.branchset.forEach ((child) => {
              data.branches.push ([getName(parent), getName(child), Math.max (child.length, 0)])
              traverse (child)
            })
        }
        traverse (newickTree)
        data.root = getName (newickTree)
      } else {  // no Newick tree was specified, so build a quick-and-dirty distance matrix with Jukes-Cantor, and get a tree by neighbor-joining
        const taxa = Object.keys(data.rowData).sort(), seqs = taxa.map ((taxon) => data.rowData[taxon])
        const distMatrix = JukesCantor.calcDistanceMatrix (seqs)
        const rnj = new RapidNeighborJoining.RapidNeighborJoining (distMatrix, taxa.map ((name) => ({ name })))
        log (config.warn, "Building neighbor-joining tree")
        rnj.run()
        const tree = rnj.getAsObject()
        let nodes = 0
        const getName = (obj) => { obj.taxon = obj.taxon || { name: 'node' + (++nodes) }; return obj.taxon.name }
        data.branches = []
        const traverse = (parent) => {  // auto-name internal nodes
          parent.children.forEach ((child) => {
            data.branches.push ([getName(parent), getName(child), Math.max (child.length, 0)])
            traverse (child)
          })
        }
        traverse (tree)
        data.root = getName (tree)
      }
    }
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

  // default configuration
  // it's a bit arbitrary which things are configurable, and which are hardwired
  const defaultConfig = {
    treeAlignHeight: 400,
    genericRowHeight: 24,
    nameFontSize: 12,
    containerHeight: '100%',
    containerWidth: '100%',
    treeWidth: 200,
    nameDivWidth: 200,
    branchStrokeStyle: 'black',
    nodeHandleRadius: 4,
    nodeHandleClickRadius: 40,
    nodeHandleFillStyle: 'white',
    collapsedNodeHandleFillStyle: 'black',
    rowConnectorDash: [2,2],
    structureConfig: { width: 300, height: 300 },
    handler: {},
    colorScheme: defaultColorScheme
  }
  
  // main entry point: the render method
  // The basic flow here is as follows:
  // (1) On the first call to render(), data is made whole (formats parsed, tree estimated if necessary, indices built); state & config are initialized
  // (2) On every call to render() a layout is performed (for both tree & alignment). Animations involve a series of calls to render(), one per frame, scaling rows & columns
  // (3) The tree and alignment are also redrawn on every call to render()
  // (4) Alignment can be redrawn due to scrolling; this however bypasses render() entirely, calling redrawCanvas() instead. This causes some messiness, documented below.
  const render = async (opts) => {
    const { data } = opts
    const indices = opts.indices = opts.indices || {}
    const dom = opts.dom = opts.dom || {}

    // state
    const state = opts.state = extend ({ collapsed: {},   // true if an internal node has been collapsed by the user
                                         forceDisplayNode: {},   // force a node to be displayed even if it's flagged as collapsed. Used by animation code
                                         nodeScale: {},  // height scaling factor for tree nodes / alignment rows. From 0 to 1 (undefined implies 1)
                                         columnScale: {},  // height scaling factor for alignment columns. From 0 to 1 (undefined implies 1)
                                         scrollTop: 0,
                                         scrollLeft: 0,
                                         disableTreeEvents: false,
                                         structure: { openStructures: [] } },
                                       opts.state || {})
    
    const { collapsed, forceDisplayNode, nodeScale, columnScale, disableTreeEvents, structureState } = state

    // Create a function to get state from the opts object, rather than passing in the state object directly.
    // The need for this is a consequence of two things:
    //  (1) a dirty hack (the redrawCanvas method), used when scrolling, that bypasses the "proper" flow of calling render() to redraw things;
    //  (2) the fact that we change opts.state at the top of this method.
    // The first of these things means that we need to create a closure (redrawCanvas) that can change the state;
    // the second thing means that we can't rely on a reference to state being persistent/stable, so instead we pass in a method that gets it.
    // This is all a bit convoluted and it would almost certainly be better to take a purer React-style approach to redrawing the canvas after a scroll.
    // (Note that we could also just avoid reassigning opts.state, instead rewriting the individual properties of that object,
    //  but that makes the code a bit uglier and harder to read.)
    const getState = () => opts.state
    
    // config
    const config = extend ({}, defaultConfig, opts.config || {})
    const { parent, warn, treeAlignHeight, genericRowHeight, nameFontSize, containerHeight, containerWidth, treeWidth, nameDivWidth, branchStrokeStyle, nodeHandleRadius, nodeHandleClickRadius, nodeHandleFillStyle, collapsedNodeHandleFillStyle, rowConnectorDash, structureConfig, handler } = config

    // data (it's assumed that this does not change after the first call)
    getData (data, config)

    // tree configuration
    const treeStrokeWidth = 1
    const nodeHandleStrokeStyle = branchStrokeStyle
    const availableTreeWidth = treeWidth - nodeHandleRadius - 2*treeStrokeWidth
    const scrollbarHeight = 20  // hack, could be platform-dependent, a bit fragile...
    const computedTreeConfig = { treeWidth, availableTreeWidth, genericRowHeight, branchStrokeStyle, nodeHandleStrokeStyle, nodeHandleRadius, nodeHandleClickRadius, nodeHandleFillStyle, collapsedNodeHandleFillStyle, rowConnectorDash, treeStrokeWidth, scrollbarHeight }

    // font configuration
    const charFontName = 'Menlo,monospace'
    const nameFontName = 'serif'
    const nameFontColor = 'black'
    const charFont = genericRowHeight + 'px ' + charFontName
    const nameFont = nameFontSize + 'px ' + nameFontName
    const color = config.color || colorScheme[config.colorScheme]
    const computedFontConfig = { charFont, charFontName, color, nameFont, nameFontName, nameFontSize, nameFontColor, genericRowHeight }

    // build indices of tree & alignment (this only needs to be done once, as it's assumed the data doesn't cahnge)
    const treeIndex = indices.treeIndex = indices.treeIndex || indexTree ({ data })
    const alignIndex = indices.alignIndex = indices.alignIndex || indexAlignment ({ data })

    // get tree & alignment layout. This is recomputed with every call to render()
    const computedState = extend (getNodeVisibility ({ data, state, treeIndex, alignIndex }),
                                  state)
    const treeLayout = layoutTree ({ computedState, computedTreeConfig, treeIndex, config })
    const alignLayout = layoutAlignment ({ treeIndex, alignIndex, computedState, computedFontConfig })
    
    // create the tree & alignment container DIVs
    createContainer ({ dom, config, treeLayout, alignIndex, alignLayout })

    // render the tree
    renderTree ({ treeIndex, treeLayout, computedState, computedTreeConfig, dom })

    // attach tree event handlers
    if (!disableTreeEvents) {
      const nodeClicked = makeNodeClickHandler ({ treeIndex, alignIndex, computedState, renderOpts: opts })
      attachTreeHandlers ({ dom, nodeClicked, treeLayout, computedTreeConfig, state })
    }

    // build the alignment
    buildAlignment ({ dom, config, data, computedFontConfig, alignLayout, treeLayout, treeIndex, alignIndex, computedState, getState })

    // style the alignment
    styleAlignment ({ dom, treeIndex, treeLayout, computedState, alignLayout })

    // attach the canvas
    attachAlignCanvas ({ dom, treeIndex, treeLayout, alignIndex, data, computedFontConfig, alignLayout, config, getState })

    // set scroll state
    setScrollState ({ dom, state })

    // and return
    return { element: dom.container }
  }

  return { render }
})()

if (typeof(module) !== 'undefined')
  module.exports = { render }
