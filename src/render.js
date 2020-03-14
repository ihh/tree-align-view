const render = (opts) => {
  // opts.branches is a list of [parent,child,length]
  // opts.rowData is a map of seqname->row
  // All nodes MUST be uniquely named!
  const { root, branches, rowData } = opts
  const hidden = opts.hidden || {}
  const genericRowHeight = opts.rowHeight || 16
  const treeWidth = opts.treeWidth || 200
  const nodeHandleRadius = opts.nodeHandleRadius || 4
  const nodeHandleFillStyle = opts.nodeHandleFillStyle || 'black'
  const branchStrokeStyle = opts.branchStrokeStyle || 'black'
  const rowConnectorDash = opts.rowConnectorDash || [2,2]
  const lineWidth = 1
  const availableTreeWidth = treeWidth - nodeHandleRadius - 2*lineWidth
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
      throw new Error ("All node names must be unique")
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
  let nx = {}, ny = {}, rowHeight = {}, treeHeight = 0
  nodes.forEach ((node) => {
    const rh = (hidden[node] || !rowData[node]) ? 0 : genericRowHeight
    nx[node] = nodeHandleRadius + lineWidth + availableTreeWidth * distFromRoot[node] / maxDistFromRoot
    ny[node] = treeHeight + rh / 2
    rowHeight[node] = rh
    treeHeight += rh
  })
  const create = (type, parent, attrs, styles) => {
    const element = document.createElement (type)
    if (parent)
      parent.appendChild (element)
    if (attrs)
      Object.keys(attrs).forEach ((attr) => element.setAttribute (attr, attrs[attr]))
    if (styles)
      element.setAttribute ('style', Object.keys(styles).reduce ((styleAttr, style) => styleAttr + style + ':' + styles[style] + ';', ''))
    return element
  }
  let container = create ('div', opts.parent, null, { display: 'flex', 'flex-direction': 'row' }),
      treeCanvas = create ('canvas', container, { width: treeWidth, height: treeHeight }),
      alignDiv = create ('div', container, null, { display: 'flex', 'flex-direction': 'row' }),
      namesDiv = create ('div', alignDiv, null, { 'font-size': genericRowHeight + 'px', 'margin-left': '2px', 'margin-right': '2px' }),
      rowsDiv = create ('div', alignDiv, null, { 'font-family': 'Courier,monospace', 'font-size': genericRowHeight + 'px' })
  let ctx = treeCanvas.getContext('2d')
  ctx.fillStyle = nodeHandleFillStyle
  ctx.strokeStyle = branchStrokeStyle
  ctx.lineWidth = 1
  nodes.forEach ((node) => {
    let nameDiv = create ('div', namesDiv)
    let rowDiv = create ('div', rowsDiv)
    if (rowData[node]) {
      nameDiv.innerText = node
      rowDiv.innerText = rowData[node]
    }
    if (children[node].length) {
      ctx.setLineDash ([])
      ctx.beginPath()
      ctx.arc (nx[node], ny[node], nodeHandleRadius, 0, 2*Math.PI)
      ctx.fill()
      children[node].forEach ((child) => {
        ctx.beginPath()
        ctx.moveTo (nx[node], ny[node])
        ctx.lineTo (nx[node], ny[child])
        ctx.lineTo (nx[child], ny[child])
        ctx.stroke()
      })
    } else {
      ctx.setLineDash ([])
      ctx.beginPath()
      ctx.fillRect (nx[node], ny[node] - nodeHandleRadius, 1, 2*nodeHandleRadius)
      ctx.setLineDash (rowConnectorDash)
      ctx.beginPath()
      ctx.moveTo (nx[node], ny[node])
      ctx.lineTo (treeWidth, ny[node])
      ctx.stroke()
    }
  })
  return container
}

if (typeof(module) !== 'undefined')
  module.exports = render
