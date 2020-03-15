const { render } = (() => {
  
  const render = (opts) => {
    // opts.branches is a list of [parent,child,length]
    // opts.rowData is a map of seqname->row
    // All nodes MUST be uniquely named!
    const { root, branches, rowData } = opts
    const collapsed = opts.collapsed || {}
    const genericRowHeight = opts.rowHeight || 16
    const containerWidth = opts.width || 800
    let containerHeight = opts.height || null
    const treeWidth = opts.treeWidth || 200
    const branchStrokeStyle = opts.branchStrokeStyle || 'black'
    const nodeHandleStrokeStyle = branchStrokeStyle
    const nodeHandleRadius = opts.nodeHandleRadius || 4
    const nodeHandleFillStyle = opts.nodeHandleFillStyle || 'white'
    const collapsedNodeHandleFillStyle = opts.collapsedNodeHandleFillStyle || 'black'
    const rowConnectorDash = opts.rowConnectorDash || [2,2]
    const handler = opts.handler || {}
    const lineWidth = 1
    const availableTreeWidth = treeWidth - nodeHandleRadius - 2*lineWidth
    const scrollbarHeight = 20  // hack
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
    let nodes = [], nodeRank = {}, ancestorCollapsed = {}, distFromRoot = {}, maxDistFromRoot = 0
    const addNode = (node) => {
      if (!node)
        throw new Error ("All nodes must be named")
      if (nodeRank[node])
        throw new Error ("All node names must be unique")
      nodeRank[node] = nodes.length
      nodes.push (node)
    }
    const addSubtree = (node, parent) => {
      distFromRoot[node] = (typeof(parent) !== 'undefined' ? distFromRoot[parent] : 0) + branchLength[node]
      maxDistFromRoot = Math.max (maxDistFromRoot, distFromRoot[node])
      ancestorCollapsed[node] = ancestorCollapsed[parent] || collapsed[parent]
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
    let nx = {}, ny = {}, rowHeight = {}, treeHeight = 0
    nodes.forEach ((node) => {
      const rh = (ancestorCollapsed[node] || !(rowData[node] || (collapsed[node] && !ancestorCollapsed[node]))) ? 0 : genericRowHeight
      nx[node] = nodeHandleRadius + lineWidth + availableTreeWidth * distFromRoot[node] / maxDistFromRoot
      ny[node] = treeHeight + rh / 2
      rowHeight[node] = rh
      treeHeight += rh
    })
    treeHeight += scrollbarHeight
    containerHeight = containerHeight || treeHeight
    const create = (type, parent, styles, attrs) => {
      const element = document.createElement (type)
      if (parent)
        parent.appendChild (element)
      if (attrs)
        Object.keys(attrs).forEach ((attr) => element.setAttribute (attr, attrs[attr]))
      if (styles)
        element.setAttribute ('style', Object.keys(styles).reduce ((styleAttr, style) => styleAttr + style + ':' + styles[style] + ';', ''))
      return element
    }
    if (opts.parent)
      opts.parent.innerHTML = ''
    let container = create ('div', opts.parent, { display: 'flex', 'flex-direction': 'row', width: containerWidth + 'px', height: containerHeight + 'px', 'overflow-y': 'auto' }),
        treeDiv = create ('div', container, { width: treeWidth + 'px', height: treeHeight + 'px' }),
        treeCanvas = create ('canvas', treeDiv, null, { width: treeWidth, height: treeHeight }),
        alignDiv = create ('div', container, { display: 'flex', 'flex-direction': 'row', overflow: 'hidden', height: treeHeight + 'px' }),
        namesDiv = create ('div', alignDiv, { 'font-size': genericRowHeight + 'px', 'margin-left': '2px', 'margin-right': '2px' }),
        rowsDiv = create ('div', alignDiv, { 'font-family': 'Courier,monospace', 'font-size': genericRowHeight + 'px', 'overflow-x': 'scroll', 'overflow-y': 'hidden' })
    let ctx = treeCanvas.getContext('2d')
    ctx.strokeStyle = branchStrokeStyle
    ctx.lineWidth = 1
    const makeNodeHandlePath = (node) => {
      ctx.beginPath()
      ctx.arc (nx[node], ny[node], nodeHandleRadius, 0, 2*Math.PI)
    }
    let nodesWithHandles = nodes.filter ((node) => !ancestorCollapsed[node] && children[node].length)
    nodes.forEach ((node) => {
      let style = { height: rowHeight[node] + 'px' }
      let nameDiv = create ('div', namesDiv, style)
      let rowDiv = create ('div', rowsDiv, style)
      if (!ancestorCollapsed[node]) {
        if (rowHeight[node])
          nameDiv.innerText = node
        if (rowData[node])
          rowDiv.innerText = rowData[node]
        if (!children[node].length) {
          ctx.setLineDash ([])
          ctx.beginPath()
          ctx.fillRect (nx[node], ny[node] - nodeHandleRadius, 1, 2*nodeHandleRadius)
        }
        if (children[node].length && !collapsed[node]) {
          ctx.setLineDash ([])
          children[node].forEach ((child) => {
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
    const canvasRect = treeCanvas.getBoundingClientRect(),
          canvasOffset = { top: canvasRect.top + document.body.scrollTop,
                           left: canvasRect.left + document.body.scrollLeft }
    treeCanvas.addEventListener ('click', (evt) => {
      evt.preventDefault()
      const mouseX = parseInt (evt.clientX - canvasOffset.left)
      const mouseY = parseInt (evt.clientY - canvasOffset.top)
      let clickedNode = null
      nodesWithHandles.forEach ((node) => {
        makeNodeHandlePath (node)
        if (ctx.isPointInPath (mouseX, mouseY))
          clickedNode = node
      })
      if (clickedNode && handler.nodeClicked)
        handler.nodeClicked (clickedNode)
    })
    return { element: container }
  }

  return { render }
})()

if (typeof(module) !== 'undefined')
  module.exports = render
