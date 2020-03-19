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
  const addStylesToDocument = () => {
    const style = document.createElement('style')
    style.type = 'text/css'
    style.innerHTML =
      ['.tav-hide { display: none; }',
       '.tav-show, .tav-anim { display: flex; }',
       '.tav-show .tav-text { display: inline; }',
       '.tav-show .tav-image { display: none; }',
       '.tav-anim .tav-text { display: none; }',
       '.tav-anim .tav-image { display: inline; }'
      ].join(' ')
    document.getElementsByTagName('head')[0].appendChild(style)
  }
  
  // summarize alignment
  const summarizeAlignment = (opts) => {
    const { rowData } = opts
    let alignColToSeqPos = {}, isChar = {}, columns
    Object.keys(rowData).forEach ((node) => {
      const row = rowData[node]
      if (typeof(columns) !== 'undefined' && columns != row.length)
        console.error ("Inconsistent row lengths")
      columns = row.length
      let pos = 0
      alignColToSeqPos[node] = row.split('').map ((c) => {
        isChar[c] = true
        return isGapChar(c) ? pos : pos++
      })
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
    const { treeSummary, collapsed, forceDisplayNode, rowData } = opts
    let ancestorCollapsed = {}, nodeVisible = {}
    const setCollapsedState = (node, parent) => {
      ancestorCollapsed[node] = ancestorCollapsed[parent] || collapsed[parent]
      const kids = treeSummary.children[node]
      if (kids)
        kids.forEach ((child) => setCollapsedState (child, node))
    }
    setCollapsedState (treeSummary.root)
    treeSummary.nodes.forEach ((node) => nodeVisible[node] = !ancestorCollapsed[node] && (rowData[node] || forceDisplayNode[node]))
    return { ancestorCollapsed, nodeVisible }
  }
  
  // layout tree
  const layoutTree = (opts) => {
    let { treeAlignState, treeConfig, containerHeight, treeSummary } = opts
    const { collapsed, nodeVisible, nodeScale } = treeAlignState
    const { genericRowHeight, nodeHandleRadius, treeStrokeWidth, availableTreeWidth, scrollbarHeight } = treeConfig
    let nx = {}, ny = {}, rowHeight = {}, treeHeight = 0
    treeSummary.nodes.forEach ((node) => {
      const rh = (typeof(nodeScale[node]) !== 'undefined' ? nodeScale[node] : 1) * (nodeVisible[node] ? genericRowHeight : 0)
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
  const getAlignMetrics = (opts) => {
    const { treeSummary, alignSummary, genericRowHeight, charFont, color } = opts
    const alignChars = alignSummary.chars
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
    let charImage = {}
    alignChars.forEach ((c) => {
      let charCanvas = create ('canvas', null, null, { width: charWidth, height: genericRowHeight })
      let charContext = charCanvas.getContext('2d')
      charContext.font = charFont
      charContext.fillStyle = getColor (c, color)
      charContext.fillText (c, 0, genericRowHeight - charDescent)
      charImage[c] = charCanvas.toDataURL()
    })
    const charHeight = genericRowHeight, rowWidth = charWidth * alignSummary.columns
    return { charMetrics, charLeft, charDescent, charWidth, charHeight, charImage, rowWidth }
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
    const { parent, dom, containerWidth, containerHeight, treeWidth, treeHeight } = opts
    if (!dom.container)
      addStylesToDocument()
    let container = dom.container || create ('div', opts.parent, { display: 'flex',
                                                                   'flex-direction': 'row',
                                                                   width: containerWidth,
                                                                   height: containerHeight,
                                                                   'overflow-y': 'auto' })
    let treeDiv = dom.treeDiv || create ('div', container)
    let alignDiv = dom.alignDiv || create ('div', container)

    setStyle (treeDiv, { width: treeWidth + 'px',
                         height: treeHeight + 'px' })

    setStyle (alignDiv, { display: 'flex',
                          'flex-direction': 'row',
                          overflow: 'hidden',
                          height: treeHeight + 'px' })

    return { container, treeDiv, alignDiv }
  }

  // build (structure-linked) span for a name
  const buildNameSpan = (opts) => {
    const { name, nameFont, nameFontColor, nameDiv, structure } = opts
    let nameSpan = create ('span', nameDiv, null, { class: 'tav-text' })
    if (structure) {
      let nameAnchor = create ('a', nameSpan, null, { href: '#' })
      nameAnchor.addEventListener ('click', (evt) => {
        evt.preventDefault()
        loadStructure ({ node, structure: structure[node] })
      })
      nameAnchor.innerText = name
    } else
      nameSpan.innerText = name
    return nameSpan
  }
  
  // build image for a row name
  const buildNameImage = (opts) => {
    const { name, nameFont, nameFontColor, nameFontSize, nameDivWidth, nameDiv, maxNameImageWidth, genericRowHeight } = opts
    let measureCanvas = create ('canvas', null, null, { width: maxNameImageWidth, height: genericRowHeight })
    let measureContext = measureCanvas.getContext('2d')
    measureContext.font = nameFont
    const nameMetrics = measureContext.measureText (name)
    let nameCanvas = create ('canvas', null, null, { width: nameMetrics.width,
                                                     height: genericRowHeight })
    let nameContext = nameCanvas.getContext('2d')
    nameContext.font = nameFont
    nameContext.fillStyle = nameFontColor
    nameContext.fillText (name, 0, (genericRowHeight + nameFontSize) / 2 - 1)
    const data = nameCanvas.toDataURL()
    let img = create ('img', nameDiv,
                      { width: nameMetrics.width,
                        height: '100%' },
                      { class: 'tav-image' })
    img.src = data
    return img
  }

  // build span for an alignment char
  const buildAlignCharSpan = (opts) => {
    const { alignMetrics, color, c, handler, coords, rowDiv, genericRowHeight } = opts
    const charMetrics = alignMetrics.charMetrics[c]
    const col = getColor (c, color)
    let charSpan = create ('span', rowDiv,
                           { color: col,
                             width: alignMetrics.charWidth },
                           { class: 'tav-text' })
    charSpan.innerText = c
    if (handler.alignClick)
      charSpan.addEventListener ('click', (evt) => handler.alignClick (coords))
    if (handler.alignMouseover)
      charSpan.addEventListener ('mouseover', (evt) => handler.alignMouseover (coords))
    return charSpan
  }

  // build image for an alignment column
  const buildAlignCharImage = (opts) => {
    const { alignMetrics, c, rowDiv, genericRowHeight } = opts
    let img = create ('img', rowDiv,
                      { width: alignMetrics.charWidth,
                        height: '100%' },
                      { class: 'tav-image' })
    img.src = alignMetrics.charImage[c]
    return img
  }
  
  // create alignment
  const buildAlignment = (opts) => {
    const { rowData, structure, handler, fontConfig, alignConfig, alignMetrics, nameDivWidth, rowHeight, treeSummary, treeAlignState, alignSummary, dom, state } = opts
    const { nameFont, nameFontSize, nameFontColor, charFont, charFontName } = fontConfig
    const { rowWidth } = alignMetrics
    const { genericRowHeight, maxNameImageWidth } = alignConfig
    
    if (!dom.namesDiv) {   // first build?
      dom.namesDiv = create ('div', dom.alignDiv,
                             { 'font-size': nameFontSize + 'px',
                               'margin-left': '2px',
                               'margin-right': '2px',
                               'overflow-x': 'auto',
                               'overflow-y': 'hidden',
                               'max-width': nameDivWidth + 'px',
                               'flex-shrink': 0,
                               'white-space': 'nowrap' })
      
      dom.rowsDiv = create ('div', dom.alignDiv,
                            { 'font-family': charFontName,
                              'font-size': alignConfig.genericRowHeight + 'px',
                              'overflow-x': 'scroll',
                              'overflow-y': 'hidden',
                              'user-select': 'none',
                              '-moz-user-select': 'none',
                              '-webkit-user-select': 'none',
                              '-ms-user-select': 'none',
                              cursor: 'move' })

      attachDragHandlers ({ dom, state })

      // create the alignment names & rows, with alternating spans and (initially hidden) images
      let nameDivList = [], nameSpanList = [], nameImageList = [], rowDivList = [], rowSpanList = [], rowImageList = []
      let colSpanList = new Array (alignSummary.columns).fill ([])
      let colImageList = new Array (alignSummary.columns).fill ([])
      treeSummary.nodes.forEach ((node, row) => {

        const colToSeqPos = alignSummary.alignColToSeqPos[node]
        const seqData = rowData[node]

        const initClass = treeAlignState.nodeVisible[node] ? 'tav-show' : 'tav-hide'
        
        let nameDiv = create ('div', dom.namesDiv,
                              { height: rowHeight[node] + 'px',
                                'flex-direction': 'column',
                                'justify-content': 'center' },
                              { class: initClass })

        nameDivList.push (nameDiv)
        
        nameSpanList.push (buildNameSpan ({ name: node, structure: structure[node], nameFont, nameFontColor, nameDiv }))
        nameImageList.push (buildNameImage ({ name: node, nameFont, nameFontColor, nameFontSize, nameDiv, nameDivWidth, genericRowHeight, maxNameImageWidth }))
        
        let rowDiv = create ('div', dom.rowsDiv,
                             { width: rowWidth + 'px',
                               height: rowHeight[node] + 'px' },
                             { class: initClass })

        rowDivList.push (rowDiv)

        if (rowData[node]) {
          let spanList = [], imgList = []
          rowData[node].split('').forEach ((c, col) => {
            const coords = { node,
                             row,
                             column: col,
                             seqPos: colToSeqPos && colToSeqPos[col],
                             c,
                             isGap: isGapChar(c) }

            const span = buildAlignCharSpan ({ alignMetrics, color: fontConfig.color, c, handler, coords, rowDiv, genericRowHeight })
            const img = buildAlignCharImage ({ alignMetrics, c, rowDiv, genericRowHeight })
            colSpanList[col].push (span)
            colImageList[col].push (img)
            spanList.push (span)
            imgList.push (img)
          })
          rowSpanList.push (spanList)
          rowImageList.push (imgList)
        } else {
          colSpanList.forEach ((col) => col.push (null))
          colImageList.forEach ((col) => col.push (null))
          rowSpanList.push ([])
          rowImageList.push ([])
        }
      })

      extend (dom, { nameDivList, nameSpanList, nameImageList, rowDivList, rowSpanList, rowImageList, colSpanList, colImageList })
    }
    return dom
  }

  // style alignment
  const styleAlignment = (opts) => {
    const { dom, treeSummary, treeLayout, treeAlignState } = opts
    const { nodeVisible, nodeScale, columnScale, prevState } = treeAlignState
    const { rowHeight } = treeLayout
    
    treeSummary.nodes.forEach ((node, row) => {
      const newClass = (nodeVisible[node]
                        ? (typeof(nodeScale[node]) === 'undefined'
                           ? 'tav-show'
                           : 'tav-anim')
                        : 'tav-hide')
      const oldClass = dom.nameDivList[row].getAttribute ('class')
      if (newClass !== oldClass) {
        dom.nameDivList[row].setAttribute ('class', newClass)
        dom.rowDivList[row].setAttribute ('class', newClass)
      }
      if (nodeScale[node] !== prevState.nodeScale[node]) {
        const newStyle = { height: rowHeight[node],
                           opacity: nodeScale[node] || 1 }
        updateStyle (dom.nameDivList[row], newStyle)
        updateStyle (dom.rowDivList[row], newStyle)
      }
    })
    
    dom.colSpanList.forEach ((colSpan, col) => {
      if (columnScale[col] !== prevState.columnScale[col]) {
        // TODO: animate columns
      }
    })

    prevState.nodeVisible = extend ({}, nodeVisible)
    prevState.nodeScale = extend ({}, nodeScale)
    prevState.columnScale = extend ({}, columnScale)
  }
  
  // create node-toggle handler
  const makeNodeClickHandler = (opts) => {
    const { treeSummary, handler, treeAlignState, renderOpts } = opts
    const { collapsed, nodeScale, forceDisplayNode } = treeAlignState
    const collapseAnimationFrames = 5
    const collapseAnimationDuration = 200
    return (node) => {
      if (!handler || !handler.nodeClick || handler.nodeClick (node)) {
        let framesLeft = collapseAnimationFrames
        const wasCollapsed = collapsed[node]
        if (wasCollapsed)
          collapsed[node] = false  // leaving collapsed[node] defined indicates to renderTree() that it should be rendered as an uncollapsed node. A bit of a hack...
        const drawAnimationFrame = () => {
          if (framesLeft) {
            const scale = (wasCollapsed ? (collapseAnimationFrames + 1 - framesLeft) : framesLeft) / (collapseAnimationFrames + 1)
            treeSummary.descendants[node].forEach ((desc) => { nodeScale[desc] = scale })
            nodeScale[node] = 1 - scale
            forceDisplayNode[node] = true
            renderOpts.disableTreeEvents = true
            renderOpts.animating = true
          } else {
            treeSummary.descendants[node].forEach ((desc) => { delete nodeScale[desc] })
            delete nodeScale[node]
            if (wasCollapsed) {
              forceDisplayNode[node] = false
              delete collapsed[node]
            } else {
              forceDisplayNode[node] = true
              collapsed[node] = true
            }
            renderOpts.disableTreeEvents = false
            renderOpts.animating = false
          }
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
    const { dom, state } = opts
    const { container, rowsDiv } = dom
    const { scrollLeft, scrollTop } = state
    if (typeof(scrollLeft) !== 'undefined')
      rowsDiv.scrollLeft = scrollLeft
    if (typeof(scrollTop) !== 'undefined')
      container.scrollTop = scrollTop
  }
  
  // attach drag handlers
  const attachDragHandlers = (opts) => {
    const { dom, state } = opts
    const { container, rowsDiv } = dom
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
      dom.wasPanning = false
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
      state.scrollLeft = rowsDiv.scrollLeft = scrollLeft - walk;
      dom.wasPanning = true  // will be cleared by mouseleave or click
    });
    rowsDiv.addEventListener("scroll", () => {
      state.scrollLeft = rowsDiv.scrollLeft
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
      state.scrollTop = container.scrollTop = scrollTop - walk;
    });
    container.addEventListener("scroll", e => {
      state.scrollTop = container.scrollTop
    })
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
      setStyle (element, styles)
    return element
  }

  // set CSS styles of DOM element
  const setStyle = (element, styles) => {
    const style = Object.keys(styles).filter ((style) => styles[style] !== '').reduce ((styleAttr, style) => styleAttr + style + ':' + styles[style] + ';', '')
    element.setAttribute ('style', style)
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
  
  // main entry point
  const render = (opts) => {
    // branches is a list of [parent,child,length]
    // rowData is a map of seqname->row
    // All nodes MUST be uniquely named!
    const { data } = opts
    const summary = opts.summary = opts.summary || {}
    const config = opts.config = opts.config || {}
    const state = opts.state = opts.state || {}
    const dom = opts.dom = opts.dom || {}

    const { root, branches, rowData } = data  // mandatory arguments
    const structure = data.structure || {}

    const collapsed = state.collapsed = state.collapsed || {}
    const forceDisplayNode = state.forceDisplayNode = state.forceDisplayNode || {}
    const nodeScale = state.nodeScale = state.nodeScale || {}
    const columnScale = state.columnScale = state.columnScale || {}
    const disableTreeEvents = state.disableTreeEvents
    const prevState = state.prevState = state.prevState || { nodeVisible: {}, nodeScale: {}, columnScale: {} }

    // TODO: refactor default config into a single extend(defaultConfig,config)
    const parent = config.parent
    const genericRowHeight = config.genericRowHeight || 24
    const nameFontSize = config.nameFontSize || 12
    const containerWidth = config.width || ''
    const treeWidth = config.treeWidth || 200
    const nameDivWidth = config.nameDivWidth || 200
    const branchStrokeStyle = config.branchStrokeStyle || 'black'
    const nodeHandleStrokeStyle = branchStrokeStyle
    const nodeHandleRadius = config.nodeHandleRadius || 4
    const nodeHandleFillStyle = config.nodeHandleFillStyle || 'white'
    const collapsedNodeHandleFillStyle = config.collapsedNodeHandleFillStyle || 'black'
    const rowConnectorDash = config.rowConnectorDash || [2,2]

    const handler = config.handler || {}
    const color = config.color || colorScheme[config.colorScheme || defaultColorScheme]
    
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
    const treeSummary = summary.treeSummary = summary.treeSummary || summarizeTree ({ root, branches, collapsed })
    const { children, descendants, branchLength, nodes, nodeRank, distFromRoot, maxDistFromRoot } = treeSummary
    const { ancestorCollapsed, nodeVisible } = getNodeVisibility ({ treeSummary, collapsed, forceDisplayNode, rowData })
    const treeAlignState = { collapsed, ancestorCollapsed, forceDisplayNode, nodeVisible, nodeScale, columnScale, prevState }
    const treeLayout = layoutTree ({ treeAlignState, treeConfig, treeSummary, containerHeight: config.height || null })
    const { nx, ny, rowHeight, treeHeight, containerHeight } = treeLayout

    // get alignment alphabet and metrics
    const alignSummary = summary.alignSummary = summary.alignSummary || summarizeAlignment ({ rowData })
    const { columns } = alignSummary
    const alignMetrics = summary.alignMetrics = summary.alignMetrics || getAlignMetrics ({ treeSummary, alignSummary, genericRowHeight, charFont, color })
    const { rowWidth, charDescent, charWidth, charHeight } = alignMetrics
    
    // create the tree & alignment container DIVs
    let { container, treeDiv, alignDiv } = createContainer ({ parent, dom, containerWidth, containerHeight, treeWidth, treeHeight })
    extend (dom, { container, treeDiv, alignDiv })

    // render the tree
    const { treeCanvas, makeNodeHandlePath, nodesWithHandles } = renderTree ({ treeWidth, treeSummary, treeLayout, treeAlignState, treeConfig, treeDiv })

    // build the alignment
    let { namesDiv, rowsDiv, rowDivList, rebuilt } = buildAlignment ({ rowData, dom, structure, handler, fontConfig, alignConfig, nameDivWidth, rowHeight, alignMetrics, treeSummary, alignSummary, treeAlignState, state })
    extend (dom, { namesDiv, rowsDiv, rowDivList })

    // style the alignment
    styleAlignment ({ dom, treeSummary, treeLayout, treeAlignState })
    
    // set scroll state
    setScrollState ({ dom, state })

    // attach event handlers
    if (!disableTreeEvents) {
      const nodeClicked = makeNodeClickHandler ({ treeSummary, handler, treeAlignState, renderOpts: opts })
      attachNodeToggleHandlers ({ container, nodeClicked, treeCanvas, nodesWithHandles, makeNodeHandlePath, collapsed })
    }
    
    return { element: container }
  }

  return { render }
})()

if (typeof(module) !== 'undefined')
  module.exports = render
