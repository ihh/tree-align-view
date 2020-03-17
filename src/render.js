const { render } = (() => {

  // colors
  const colorScheme = {
    clustal: { G: "orange", P: "orange", S: "orange", T: "orange", H: "red", K: "red", R: "red", F: "blue", W: "blue", Y: "blue", I: "green", L: "green", M: "green", V: "green" },
lesk: { G: "orange", A: "orange", S: "orange", T: "orange", C: "green", V: "green", I: "green", L: "green", P: "green", F: "green", Y: "green", M: "green", W: "green", N: "magenta", Q: "magenta", H: "magenta", D: "red", E: "red", K: "blue", R: "blue" },
maeditor: { A: "lightgreen", G: "lightgreen", C: "green", D: "darkgreen", E: "darkgreen", N: "darkgreen", Q: "darkgreen", I: "blue", L: "blue", M: "blue", V: "blue", F: "lilac", W: "lilac", Y: "lilac", H: "darkblue", K: "orange", R: "orange", P: "pink", S: "red", T: "red" },
    cinema: { H: "blue", K: "blue", R: "blue", D: "red", E: "red", S: "green", T: "green", N: "green", Q: "green", A: "white", V: "white", L: "white", I: "white", M: "white", F: "magenta", W: "magenta", Y: "magenta", P: "brown", G: "brown", C: "yellow", B: "gray", Z: "gray", X: "gray", "-": "gray", ".": "gray" }
  }
  const defaultColorScheme = "maeditor"

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
    let nodes = [], nodeRank = {}, distFromRoot = {}, maxDistFromRoot = 0
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
      if (kids.length == 2) {
        addSubtree (kids[0], node)
        addNode (node)
        addSubtree (kids[1], node)
      } else {
        addNode (node)
        kids.forEach ((child) => addSubtree (child, node))
      }
    }
    addSubtree (root)
    return { root, branches, children, branchLength, nodes, nodeRank, distFromRoot, maxDistFromRoot }
  }

  // get tree collapsed/open state
  const getAncestorCollapsed = (opts) => {
    const { treeSummary, collapsed } = opts
    let ancestorCollapsed = {}
    const setCollapsedState = (node, parent) => {
      ancestorCollapsed[node] = ancestorCollapsed[parent] || collapsed[parent]
      const kids = treeSummary.children[node]
      if (kids)
        kids.forEach ((child) => setCollapsedState (child, node))
    }
    setCollapsedState (treeSummary.root)
    return ancestorCollapsed
  }
  
  // layout tree
  const layoutTree = (opts) => {
    let { collapsed, ancestorCollapsed, rowData, treeConfig, containerHeight, treeSummary } = opts
    const { genericRowHeight, nodeHandleRadius, treeStrokeWidth, availableTreeWidth, scrollbarHeight } = treeConfig
    let nx = {}, ny = {}, rowHeight = {}, treeHeight = 0
    treeSummary.nodes.forEach ((node) => {
      const rh = (ancestorCollapsed[node] || !(rowData[node] || (collapsed[node] && !ancestorCollapsed[node]))) ? 0 : genericRowHeight
      nx[node] = nodeHandleRadius + treeStrokeWidth + availableTreeWidth * treeSummary.distFromRoot[node] / treeSummary.maxDistFromRoot
      ny[node] = treeHeight + rh / 2
      rowHeight[node] = rh
      treeHeight += rh
    })
    treeHeight += scrollbarHeight
    containerHeight = containerHeight || (treeHeight + 'px')
    return { nx, ny, rowHeight, containerHeight, treeHeight }
  }

  // get metrics and other info about alignment font/chars
  const getAlignCharMetrics = (opts) => {
    const { treeSummary, rowData, genericRowHeight, charFont } = opts
    let isChar = {}
    Object.keys(rowData).forEach ((node) => rowData[node].split('').forEach ((c) => isChar[c] = 1))
    const alignChars = Object.keys(isChar).sort()
    let charDescent = 0, charWidth = 0
    alignChars.forEach ((c) => {
      let measureCanvas = create ('canvas', null, null, { width: genericRowHeight, height: genericRowHeight })
      let measureContext = measureCanvas.getContext('2d')
      measureContext.font = charFont
      let charMetrics = measureContext.measureText (c)
      charWidth = Math.max (charWidth, charMetrics.width)
      charDescent = Math.max (charDescent, charMetrics.actualBoundingBoxDescent)
    })
    const charHeight = genericRowHeight
    return { alignChars, charDescent, charWidth, charHeight }
  }

  // render alignment
  const buildNodeImageCache = (opts) => {
    const { treeSummary, rowData, alignConfig, fontConfig, alignCharMetrics } = opts
    let { nodeImageCache, rowWidth } = opts
    const { maxNameImageWidth, genericRowHeight } = alignConfig
    const { nameFont, nameFontColor, nameFontSize, charFont, color } = fontConfig
    nodeImageCache = nodeImageCache || {}
    rowWidth = rowWidth || 0
    treeSummary.nodes.forEach ((node) => {
      let imageCache = nodeImageCache[node] || {}
      if (!imageCache.name) {
        let measureCanvas = create ('canvas', null, null, { width: maxNameImageWidth, height: genericRowHeight })
        let measureContext = measureCanvas.getContext('2d')
        measureContext.font = nameFont
        const nameMetrics = measureContext.measureText (node)
        imageCache.nameWidth = nameMetrics.width
        let nameCanvas = create ('canvas', null, null, { width: imageCache.nameWidth,
                                                         height: genericRowHeight })
        let nameContext = nameCanvas.getContext('2d')
        nameContext.font = nameFont
        nameContext.fillStyle = nameFontColor
        nameContext.fillText (node, 0, (genericRowHeight + nameFontSize) / 2 - 1)
        imageCache.name = nameCanvas.toDataURL()
      }

      if (rowData[node] && !imageCache.row) {
        rowWidth = Math.max (rowWidth, rowData[node].length * alignCharMetrics.charWidth)
        let rowCanvas = create ('canvas', null, null, { width: rowWidth,
                                                        height: genericRowHeight })
        let rowContext = rowCanvas.getContext('2d')
        rowContext.font = charFont
        rowData[node].split('').forEach ((c, pos) => {
          rowContext.fillStyle = color[c.toUpperCase()] || color['default'] || 'black'
          rowContext.fillText (c, pos * alignCharMetrics.charWidth, genericRowHeight - alignCharMetrics.charDescent)
        })
        imageCache.row = rowCanvas.toDataURL()
      }
      nodeImageCache[node] = imageCache
    })
    return { nodeImageCache, rowWidth }
  }

  // render tree
  const renderTree = (opts) => {
    const { treeWidth, treeSummary, treeLayout, collapsed, ancestorCollapsed, treeConfig } = opts
    const { branchStrokeStyle, treeStrokeWidth, rowConnectorDash, nodeHandleRadius, nodeHandleFillStyle, collapsedNodeHandleFillStyle } = treeConfig
    let { treeDiv } = opts
    const { nx, ny, treeHeight } = treeLayout
    let treeCanvas = create ('canvas', treeDiv, null, { width: treeWidth,
                                                        height: treeHeight }),
        ctx = treeCanvas.getContext('2d')
    ctx.strokeStyle = branchStrokeStyle
    ctx.lineWidth = treeStrokeWidth
    const makeNodeHandlePath = (node) => {
      ctx.beginPath()
      ctx.arc (nx[node], ny[node], nodeHandleRadius, 0, 2*Math.PI)
    }
    let nodesWithHandles = treeSummary.nodes.filter ((node) => !ancestorCollapsed[node] && treeSummary.children[node].length)
    treeSummary.nodes.forEach ((node) => {
      if (!ancestorCollapsed[node]) {
        if (!treeSummary.children[node].length) {
          ctx.setLineDash ([])
          ctx.beginPath()
          ctx.fillRect (nx[node], ny[node] - nodeHandleRadius, 1, 2*nodeHandleRadius)
        }
        if (treeSummary.children[node].length && !collapsed[node]) {
          ctx.setLineDash ([])
          treeSummary.children[node].forEach ((child) => {
            ctx.beginPath()
            ctx.moveTo (nx[node], ny[node])
            ctx.lineTo (nx[node], ny[child])
            ctx.lineTo (nx[child], ny[child])
            ctx.stroke()
          })
        } else {
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
      makeNodeHandlePath (node)
      if (collapsed[node])
        ctx.fillStyle = collapsedNodeHandleFillStyle
      else {
        ctx.fillStyle = nodeHandleFillStyle
        ctx.stroke()
      }
      ctx.fill()
    })
    return { treeCanvas, nodesWithHandles, makeNodeHandlePath }
  }

  // attach node-toggle handlers
  const attachNodeToggleHandlers = (opts) => {
    const { container, handler, treeCanvas, nodesWithHandles, makeNodeHandlePath } = opts
    const canvasRect = treeCanvas.getBoundingClientRect(),
          canvasOffset = { top: canvasRect.top + document.body.scrollTop,
                           left: canvasRect.left + document.body.scrollLeft }
    treeCanvas.addEventListener ('click', (evt) => {
      evt.preventDefault()
      const mouseX = parseInt (evt.clientX - canvasOffset.left)
      const mouseY = parseInt (evt.clientY - canvasOffset.top + container.scrollTop)
      let clickedNode = null
      let ctx = treeCanvas.getContext('2d')
      nodesWithHandles.forEach ((node) => {
        makeNodeHandlePath (node)
        if (ctx.isPointInPath (mouseX, mouseY))
          clickedNode = node
      })
      if (clickedNode && handler.nodeClicked)
        handler.nodeClicked (clickedNode)
    })
  }
  
  // attach drag handlers
  const attachDragHandlers = (opts) => {
    const { rowsDiv, container } = opts
    let { scrollLeft, scrollTop } = opts

    if (typeof(scrollLeft) !== 'undefined')
      rowsDiv.scrollLeft = scrollLeft
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
    });

    let startY, containerMouseDown;
    if (typeof(scrollTop) !== 'undefined')
      container.scrollTop = scrollTop
    container.addEventListener("mousedown", e => {
      containerMouseDown = true;
      container.classList.add("active");
      startY = e.pageY - container.offsetTop;
      scrollTop = container.scrollTop;
    });
    container.addEventListener("mouseleave", () => {
      containerMouseDown = false;
      container.classList.remove("active");
    });
    container.addEventListener("mouseup", () => {
      containerMouseDown = false;
      container.classList.remove("active");
    });
    container.addEventListener("mousemove", e => {
      if (!containerMouseDown) return;
      e.preventDefault();
      const y = e.pageY - container.offsetTop;
      const walk = y - startY;
      container.scrollTop = scrollTop - walk;
    });
  }
  
  // create DOM element
  const create = (type, parent, styles, attrs) => {
    const element = document.createElement (type)
    if (parent)
      parent.appendChild (element)
    if (attrs)
      Object.keys(attrs).filter ((attr) => typeof(attrs[attr]) !== 'undefined').forEach ((attr) => element.setAttribute (attr, attrs[attr]))
    if (styles)
      element.setAttribute ('style', Object.keys(styles).filter ((style) => styles[style] !== '').reduce ((styleAttr, style) => styleAttr + style + ':' + styles[style] + ';', ''))
    return element
  }
  
  const render = (opts) => {
    // opts.branches is a list of [parent,child,length]
    // opts.rowData is a map of seqname->row
    // All nodes MUST be uniquely named!
    const { root, branches, rowData } = opts  // mandatory arguments
    const collapsed = opts.collapsed || {}
    const genericRowHeight = opts.rowHeight || 24
    const nameFontSize = opts.nameFontSize || 12
    const containerWidth = opts.width || ''
    const treeWidth = opts.treeWidth || 200
    const nameWidth = opts.nameWidth || 200
    const branchStrokeStyle = opts.branchStrokeStyle || 'black'
    const nodeHandleStrokeStyle = branchStrokeStyle
    const nodeHandleRadius = opts.nodeHandleRadius || 4
    const nodeHandleFillStyle = opts.nodeHandleFillStyle || 'white'
    const collapsedNodeHandleFillStyle = opts.collapsedNodeHandleFillStyle || 'black'
    const rowConnectorDash = opts.rowConnectorDash || [2,2]
    const handler = opts.handler || {}
    const color = opts.color || colorScheme[opts.colorScheme || defaultColorScheme]
    let scrollTop = opts.scrollTop

    const treeStrokeWidth = 1
    const availableTreeWidth = treeWidth - nodeHandleRadius - 2*treeStrokeWidth

    const charFontName = 'Menlo,monospace'
    const nameFontName = 'serif'
    const nameFontColor = 'black'
    const scrollbarHeight = 20  // hack
    const maxNameImageWidth = 1000  // hack, a bit arbitrary
    
    const charFont = genericRowHeight + 'px ' + charFontName
    const nameFont = nameFontSize + 'px ' + nameFontName

    const treeConfig = { treeWidth, availableTreeWidth, genericRowHeight, branchStrokeStyle, nodeHandleStrokeStyle, nodeHandleRadius, nodeHandleFillStyle, collapsedNodeHandleFillStyle, rowConnectorDash, treeStrokeWidth, scrollbarHeight }
    const alignConfig = { maxNameImageWidth, genericRowHeight }
    const fontConfig = { charFont, charFontName, color, nameFont, nameFontName, nameFontSize, nameFontColor }

    // get tree structure, state & layout
    const treeSummary = opts.treeSummary = opts.treeSummary || summarizeTree ({ root, branches, collapsed })
    const { children, branchLength, nodes, nodeRank, distFromRoot, maxDistFromRoot } = treeSummary
    const ancestorCollapsed = getAncestorCollapsed ({ treeSummary, collapsed })
    const treeLayout = layoutTree ({ collapsed, ancestorCollapsed, rowData, treeConfig, treeSummary, containerHeight: opts.height || null })
    const { nx, ny, rowHeight, treeHeight, containerHeight } = treeLayout

    // calculate font metrics
    const alignCharMetrics = opts.alignCharMetrics = opts.alignCharMetrics || getAlignCharMetrics ({ treeSummary, rowData, genericRowHeight, charFont })
    const { alignChars, charDescent, charWidth, charHeight } = alignCharMetrics
    
    // render the alignment names and rows as base64-encoded images
    const { nodeImageCache, rowWidth } = buildNodeImageCache ({ treeSummary, rowData, alignConfig, fontConfig, alignCharMetrics,
                                                                nodeImageCache: opts.nodeImageCache,
                                                                rowWidth: opts.rowWidth })
    opts.nodeImageCache = nodeImageCache
    opts.rowWidth = rowWidth

    // create the alignment DIVs
    if (opts.parent)
      opts.parent.innerHTML = ''
    let container = create ('div', opts.parent, { display: 'flex',
                                                  'flex-direction': 'row',
                                                  width: containerWidth,
                                                  height: containerHeight,
                                                  'overflow-y': 'auto' }),
        treeDiv = create ('div', container, { width: treeWidth + 'px',
                                              height: treeHeight + 'px' }),
        alignDiv = create ('div', container, { display: 'flex',
                                               'flex-direction': 'row',
                                               overflow: 'hidden',
                                               height: treeHeight + 'px' }),
        namesDiv = create ('div', alignDiv, { 'font-size': nameFontSize + 'px',
                                              'margin-left': '2px',
                                              'margin-right': '2px',
                                              'overflow-x': 'auto',
                                              'overflow-y': 'hidden',
                                              'max-width': nameWidth + 'px',
                                              'flex-shrink': 0,
                                              'white-space': 'nowrap' }),
        rowsDiv = create ('div', alignDiv, { 'font-family': charFontName,
                                             'font-size': genericRowHeight + 'px',
                                             'overflow-x': 'scroll',
                                             'overflow-y': 'hidden',
                                             cursor: 'move' })

    // create the alignment names & rows, and attach the rendered images
    nodes.forEach ((node) => {
      const imageCache = nodeImageCache[node]
      let nameDiv = create ('div', namesDiv, { height: rowHeight[node] + 'px',
                                               display: 'flex',
                                               'flex-direction': 'column',
                                               'justify-content': 'center' })
      let rowDiv = create ('div', rowsDiv, { width: rowWidth + 'px',
                                             height: rowHeight[node] + 'px',
                                             display: 'flex' })
      if (!ancestorCollapsed[node]) {
        const rh = rowHeight[node]
        if (rh) {
          let nameImg = create ('img', nameDiv, { width: imageCache.nameWidth,
                                                  height: rh },
                                { draggable: false })
          nameImg.src = imageCache.name
          if (rowData[node]) {
            let rowImg = create ('img', rowDiv, null,
                                 { draggable: false })
            rowImg.src = imageCache.row
          }
        }
      }
    })

    // render the tree
    const { treeCanvas, makeNodeHandlePath, nodesWithHandles } = renderTree ({ treeWidth, treeSummary, treeLayout, collapsed, ancestorCollapsed, treeConfig, treeDiv })

    // attach node toggle event handlers
    attachNodeToggleHandlers ({ container, handler, treeCanvas, nodesWithHandles, makeNodeHandlePath })

    // attach drag event handlers
    attachDragHandlers ({ scrollLeft: opts.scrollLeft,
                          scrollTop: opts.scrollTop,
                          rowsDiv,
                          container })
    
    return { element: container,
             scrollTop: () => container.scrollTop,
             scrollLeft: () => rowsDiv.scrollLeft,
             nodeImageCache,
             rowWidth }
  }

  return { render }
})()

if (typeof(module) !== 'undefined')
  module.exports = render
