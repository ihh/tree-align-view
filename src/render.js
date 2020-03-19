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

  // summarize alignment
  const summarizeAlignment = (opts) => {
    const { rowData } = opts
    let alignColToSeqPos = {}, columns
    Object.keys(rowData).forEach ((node) => {
      const row = rowData[node]
      if (typeof(columns) !== 'undefined' && columns != row.length)
        console.error ("Inconsistent row lengths")
      columns = row.length
      let pos = 0
      alignColToSeqPos[node] = row.split('').map ((c) => {
        return isGapChar(c) ? pos : pos++
      })
    })
    return { alignColToSeqPos, columns }
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
    let { treeState, rowData, treeConfig, containerHeight, treeSummary } = opts
    const { collapsed, ancestorCollapsed, forceDisplayNode, nodeScale } = treeState
    const { genericRowHeight, nodeHandleRadius, treeStrokeWidth, availableTreeWidth, scrollbarHeight } = treeConfig
    let nx = {}, ny = {}, rowHeight = {}, treeHeight = 0
    treeSummary.nodes.forEach ((node) => {
      const rh = (typeof(nodeScale[node]) !== 'undefined' ? nodeScale[node] : 1)
            * ((ancestorCollapsed[node] || (!rowData[node] && !forceDisplayNode[node])) ? 0 : genericRowHeight)
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
    let charDescent = 0, charLeft = 0, charWidth = 0, charMetrics = {}
    alignChars.forEach ((c) => {
      let measureCanvas = create ('canvas', null, null, { width: genericRowHeight, height: genericRowHeight })
      let measureContext = measureCanvas.getContext('2d')
      measureContext.font = charFont
      charMetrics[c] = measureContext.measureText (c)
      charWidth = Math.max (charWidth, Math.ceil (charMetrics[c].width))
      charDescent = Math.max (charDescent, charMetrics[c].actualBoundingBoxDescent)
      charLeft = Math.min (charLeft, charMetrics[c].actualBoundingBoxLeft)
    })
    const charHeight = genericRowHeight
    return { alignChars, charMetrics, charLeft, charDescent, charWidth, charHeight }
  }
  
  // pre-render alignment rows
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
        rowWidth = Math.max (rowWidth, Math.ceil (rowData[node].length * alignCharMetrics.charWidth))
        let rowDiv = create ('div', null, { display: 'flex',
                                            'flex-direction': 'row',
                                            width: rowWidth,
                                            height: genericRowHeight })
        let rowCanvas = create ('canvas', null, null, { width: rowWidth,
                                                        height: genericRowHeight })
        let rowContext = rowCanvas.getContext('2d')
        rowContext.font = charFont
        rowData[node].split('').forEach ((c, pos) => {
          const charMetrics = alignCharMetrics.charMetrics[c]
          const col = color[c.toUpperCase()] || color['default'] || 'black'
          rowContext.fillStyle = col
          rowContext.fillText (c, pos * alignCharMetrics.charWidth, genericRowHeight - alignCharMetrics.charDescent)
          let charSpan = create ('span', rowDiv, { color: col, width: alignCharMetrics.charWidth })
          charSpan.innerText = c
        })
        imageCache.row = rowCanvas.toDataURL()
        imageCache.rowDiv = rowDiv
      }
      nodeImageCache[node] = imageCache
    })
    return { nodeImageCache, rowWidth }
  }
  
  // render tree
  const renderTree = (opts) => {
    const { treeWidth, treeSummary, treeLayout, treeState, treeConfig } = opts
    const { collapsed, ancestorCollapsed, forceDisplayNode, nodeScale } = treeState
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
  const createContainer = (opts) => {
    const { parent, divs, containerWidth, containerHeight, treeWidth, treeHeight } = opts
    let container = divs.container || create ('div', opts.parent, { display: 'flex',
                                                                    'flex-direction': 'row',
                                                                    width: containerWidth,
                                                                    height: containerHeight,
                                                                    'overflow-y': 'auto' })
    let treeDiv = divs.treeDiv || create ('div', container)
    let alignDiv = divs.alignDiv || create ('div', container)

    setStyles (treeDiv, { width: treeWidth + 'px',
                          height: treeHeight + 'px' })

    setStyles (alignDiv, { display: 'flex',
                           'flex-direction': 'row',
                           overflow: 'hidden',
                           height: treeHeight + 'px' })

    return { container, treeDiv, alignDiv }
  }
  
  // create alignment DIVs
  const buildAlignment = (opts) => {
    const { rowData, structure, fontConfig, alignConfig, nameWidth, rowWidth, rowHeight, treeSummary, treeState, ancestorCollapsed, nodeImageCache, divs } = opts
    const { nameFontSize, charFontName } = fontConfig

    let rebuilt = { row: {} }
    const buildAll = !(divs.namesDiv && divs.rowsDiv)
    let namesDiv = divs.namesDiv
        || (rebuilt.names = create ('div', divs.alignDiv,
                                    { 'font-size': nameFontSize + 'px',
                                      'margin-left': '2px',
                                      'margin-right': '2px',
                                      'overflow-x': 'auto',
                                      'overflow-y': 'hidden',
                                      'max-width': nameWidth + 'px',
                                      'flex-shrink': 0,
                                      'white-space': 'nowrap' }))
    let rowsDiv = divs.rowsDiv
        || (rebuilt.rows = create ('div', divs.alignDiv,
                                   { 'font-family': charFontName,
                                     'font-size': alignConfig.genericRowHeight + 'px',
                                     'overflow-x': 'scroll',
                                     'overflow-y': 'hidden',
                                     'user-select': 'none',
                                     '-moz-user-select': 'none',
                                     '-webkit-user-select': 'none',
                                     '-ms-user-select': 'none',
                                     cursor: 'move' }))
    
    // create the alignment names & rows, and attach the relevant divs or images
    let rowDivList = []
    treeSummary.nodes.forEach ((node, n) => {
      if (buildAll || treeState.forceRebuildNode[node]) {
        const imageCache = nodeImageCache[node]
        let nameDiv = create ('div', null, { height: rowHeight[node] + 'px',
                                             display: 'flex',
                                             'flex-direction': 'column',
                                             'justify-content': 'center' })
        let rowDiv = create ('div', null, { width: rowWidth + 'px',
                                            height: rowHeight[node] + 'px',
                                            display: 'flex' })
        if (!ancestorCollapsed[node]) {
          const rh = rowHeight[node]
          if (rh) {
            if (typeof(treeState.nodeScale[node]) === 'undefined' || treeState.forceDisplayNode[node]) {
              let nameSpan = create ('span', nameDiv)
              if (structure[node]) {
                let nameAnchor = create ('a', nameSpan, null, { href: '#' })
                nameAnchor.addEventListener ('click', (evt) => {
                  evt.preventDefault()
                  loadStructure ({ node, structure: structure[node] })
                })
                nameAnchor.innerText = node
              } else
                nameSpan.innerText = node
            } else {
              let nameImg = create ('img', nameDiv, { width: imageCache.nameWidth,
                                                      height: rh },
                                    { draggable: false })
              nameImg.src = imageCache.name
            }
            if (rowData[node]) {
              if (treeState.animating) {
                let rowImg = create ('img', rowDiv,
                                     { opacity: treeState.nodeScale[node] },
                                     { draggable: false })
                rowImg.src = imageCache.row
              } else
                rowDiv.appendChild (imageCache.rowDiv)
            }
          }
        }
        replaceNthChild (namesDiv, n, nameDiv)
        replaceNthChild (rowsDiv, n, rowDiv)
        rowDivList[n] = rowDiv
        rebuilt.row[n] = true
        
        delete treeState.forceRebuildNode[node]
      }
    })

    return { namesDiv, rowsDiv, rowDivList, rebuilt }
  }

  // create node-toggle handler
  const makeNodeClickHandler = (opts) => {
    const { treeSummary, renderOpts } = opts
    const { handler, collapsed, nodeScale, forceDisplayNode } = renderOpts
    const collapseAnimationFrames = 5
    const collapseAnimationDuration = 200
    return (node) => {
      if (!handler || !handler.nodeClick || handler.nodeClick (node)) {
        let framesLeft = collapseAnimationFrames
        const wasCollapsed = collapsed[node]
        if (wasCollapsed)
          collapsed[node] = false  // leaving collapsed[node] defined indicates to renderTree() that it should be rendered as an uncollapsed node. A bit of a hack...
        let forceRebuildNode = {}
        const drawAnimationFrame = () => {
          if (framesLeft) {
            const scale = (wasCollapsed ? (collapseAnimationFrames + 1 - framesLeft) : framesLeft) / (collapseAnimationFrames + 1)
            treeSummary.descendants[node].forEach ((desc) => { nodeScale[desc] = scale; forceRebuildNode[desc] = true })
            nodeScale[node] = 1 - scale
            forceDisplayNode[node] = true
            forceRebuildNode[node] = true
            renderOpts.disableEvents = true
            renderOpts.animating = true
          } else {
            treeSummary.descendants[node].forEach ((desc) => { delete nodeScale[desc]; forceRebuildNode[desc] = true })
            delete nodeScale[node]
            if (wasCollapsed) {
              forceDisplayNode[node] = false
              delete collapsed[node]
            } else {
              forceDisplayNode[node] = true
              collapsed[node] = true
            }
            forceRebuildNode[node] = true
            renderOpts.disableEvents = false
            renderOpts.animating = false
          }
          renderOpts.forceRebuildNode = forceRebuildNode
          render (renderOpts)
          if (framesLeft--)
            setTimeout (drawAnimationFrame, collapseAnimationDuration / collapseAnimationFrames)
        }
        drawAnimationFrame (collapseAnimationFrames)
      }
    }
  }
  
  // attach node-toggle handler
  const attachNodeToggleHandlers = (opts) => {
    const { container, nodeClicked, treeCanvas, nodesWithHandles, makeNodeHandlePath, collapsed } = opts
    const canvasRect = treeCanvas.getBoundingClientRect(),
          canvasOffset = { top: canvasRect.top + container.scrollTop + document.body.scrollTop,  // who knows why we need to include container.scrollTop here? not me. or 1 hour of my life
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
      if (clickedNode)
        nodeClicked (clickedNode)
    })
  }

  // set scroll state
  const setScrollState = (opts) => {
    const { divs, scrollLeft, scrollTop } = opts
    const { container, rowsDiv } = divs
    if (typeof(scrollLeft) !== 'undefined')
      rowsDiv.scrollLeft = scrollLeft
    if (typeof(scrollTop) !== 'undefined')
      container.scrollTop = scrollTop
  }
  
  // attach drag handlers
  const attachDragHandlers = (opts) => {
    const { divs } = opts
    const { container, rowsDiv } = divs
    let { scrollLeft, scrollTop, scrollState } = opts

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
      divs.wasPanning = false
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
      scrollState.scrollLeft = rowsDiv.scrollLeft = scrollLeft - walk;
      divs.wasPanning = true  // will be cleared by mouseleave or click
    });
    rowsDiv.addEventListener("scroll", () => {
      scrollState.scrollLeft = rowsDiv.scrollLeft
    })

    let startY, containerMouseDown;
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
      scrollState.scrollTop = container.scrollTop = scrollTop - walk;
    });
    container.addEventListener("scroll", e => {
      scrollState.scrollTop = container.scrollTop
    })
  }

  // attach alignment mouseover and click handlers
  const attachAlignHandlers = (opts) => {
    const { handler, treeSummary, alignSummary, rowData, alignCharMetrics, divs, rebuilt } = opts
    const { rowsDiv, rowDivList } = divs
    const resolveColumn = makeColumnResolver ({ alignCharMetrics, rowsDiv })
    rowDivList.forEach ((rowDiv, row) => {
      if (rebuilt.row[row]) {
        const node = treeSummary.nodes[row]
        const colToSeqPos = alignSummary.alignColToSeqPos[node]
        const seqData = rowData[node]
        const resolveCoords = (evt) => {
          const column = resolveColumn(evt), seqPos = colToSeqPos && colToSeqPos[column], c = seqData && seqData.charAt(column)
          return { node, row, column, seqPos, c, isGap: isGapChar(c) }
        }
        if (handler.alignClick)
          rowDiv.addEventListener ('click', (evt) => handler.alignClick (resolveCoords (evt)))
        if (handler.alignMouseover)
          rowDiv.addEventListener ('mouseover', (evt) => handler.alignMouseover (resolveCoords (evt)))
      }
    })
  }
  
  // resolve event to alignment column
  const makeColumnResolver = (opts) => {
    const { alignCharMetrics, rowsDiv } = opts
    const rowsDivRect = rowsDiv.getBoundingClientRect(),
          rowsDivXOffset = rowsDivRect.left
    return (evt) => {
      return Math.floor ((evt.clientX - rowsDivXOffset + rowsDiv.scrollLeft) / alignCharMetrics.charWidth)
    }
  }

  // load a PDB structure
  const loadStructure = (opts) => {
    const { node, structure } = opts
    console.warn ('loading ' + structure + ' for ' + node)
  }
  
  // create DOM element
  const create = (type, parent, styles, attrs) => {
    const element = document.createElement (type)
    if (parent)
      parent.appendChild (element)
    if (attrs)
      Object.keys(attrs).filter ((attr) => typeof(attrs[attr]) !== 'undefined').forEach ((attr) => element.setAttribute (attr, attrs[attr]))
    if (styles)
      setStyles (element, styles)
    return element
  }

  // set CSS styles of DOM element
  const setStyles = (element, styles) => {
    element.setAttribute ('style', Object.keys(styles).filter ((style) => styles[style] !== '').reduce ((styleAttr, style) => styleAttr + style + ':' + styles[style] + ';', ''))
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
  }
  
  // main entry point
  const render = (opts) => {
    // opts.branches is a list of [parent,child,length]
    // opts.rowData is a map of seqname->row
    // All nodes MUST be uniquely named!
    const { root, branches, rowData } = opts  // mandatory arguments
    const parent = opts.parent
    const collapsed = opts.collapsed = opts.collapsed || {}
    const forceDisplayNode = opts.forceDisplayNode = opts.forceDisplayNode || {}
    const nodeScale = opts.nodeScale = opts.nodeScale || {}
    const divs = opts.divs = opts.divs || {}
    const forceRebuildNode = opts.forceRebuildNode || {}
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
    const disableEvents = opts.disableEvents
    const animating = opts.animating
    const handler = opts.handler || {}
    const color = opts.color || colorScheme[opts.colorScheme || defaultColorScheme]
    const structure = opts.structure || {}
    
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
    const alignSummary = opts.alignSummary = opts.alignSummary || summarizeAlignment ({ rowData })
    const { children, descendants, branchLength, nodes, nodeRank, distFromRoot, maxDistFromRoot } = treeSummary
    const ancestorCollapsed = getAncestorCollapsed ({ treeSummary, collapsed })
    const treeState = { collapsed, ancestorCollapsed, forceDisplayNode, forceRebuildNode, nodeScale, animating }
    const treeLayout = layoutTree ({ treeState, rowData, treeConfig, treeSummary, containerHeight: opts.height || null })
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

    // create the tree & alignment container DIVs
    let { container, treeDiv, alignDiv } = createContainer ({ parent, divs, containerWidth, containerHeight, treeWidth, treeHeight })
    extend (divs, { container, treeDiv, alignDiv })

    // build the alignment
    let { namesDiv, rowsDiv, rowDivList, rebuilt } = buildAlignment ({ rowData, divs, structure, fontConfig, alignConfig, nameWidth, rowWidth, rowHeight, treeSummary, treeState, ancestorCollapsed, nodeImageCache })
    extend (divs, { namesDiv, rowsDiv, rowDivList })

    // render the tree
    const { treeCanvas, makeNodeHandlePath, nodesWithHandles } = renderTree ({ treeWidth, treeSummary, treeLayout, treeState, treeConfig, treeDiv })

    // attach event handlers
    const scrollOpts = { scrollLeft: opts.scrollLeft,
                         scrollTop: opts.scrollTop,
                         scrollState: opts,
                         divs,
                         container }
    setScrollState (scrollOpts)
    if (!disableEvents) {
      const nodeClicked = makeNodeClickHandler ({ treeSummary, renderOpts: opts })
      attachNodeToggleHandlers ({ container, nodeClicked, treeCanvas, nodesWithHandles, makeNodeHandlePath, collapsed })
      if (rebuilt.rows)
        attachDragHandlers (scrollOpts)
      attachAlignHandlers ({ handler, treeSummary, alignSummary, rowData, alignCharMetrics, divs, rebuilt })
    }
    
    return { element: container,
             nodeImageCache,
             rowWidth }
  }

  return { render }
})()

if (typeof(module) !== 'undefined')
  module.exports = render
