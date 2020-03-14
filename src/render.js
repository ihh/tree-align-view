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
  const availableTreeWidth = treeWidth - nodeHandleRadius
  let children = {}, branchLength = {}
  children[root] = []
  branches.forEach ((branch) => {
    children[branch[0]] = children[branch[0]] || []
    children[branch[1]] = children[branch[1]] || []
    children[branch[0]].push (branch[1])
    branchLength[branch[1]] = branch[2]
  })
  let nodes = [], nodeRank = {}, distFromRoot = {}, maxDistFromRoot = 0
  const addNode = (node, parent) => {
    if (!node)
      throw new Error ("All nodes must be named")
    if (nodeRank[node])
      throw new Error ("All node names must be unique")
    nodeRank[node] = nodes.length
    nodes.push (node)
    distFromRoot[node] = (parent ? distFromRoot[parent] : 0) + branchLength[node]
    maxDistFromRoot = Math.max (maxDistFromRoot, distFromRoot[node])
  }
  const addSubtree = (node) => {
    const kids = children[node]
    if (kids.length == 2) {
      addSubtree (kids[0])
      addNode (node)
      addSubtree (kids[1])
    } else {
      addNode (node)
      kids.forEach (addSubtree)
    }
  }
  addSubtree (root)
  let nx = {}, ny = {}, rowHeight = {}, treeHeight = 0
  nodes.forEach ((node) => {
    const rh = (hidden[node] || !rowData[node]) ? 0 : genericRowHeight
    nx[node] = nodeHandleRadius + availableTreeWidth * distFromRoot[node] / maxDistFromRoot
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
      namesDiv = create ('div', alignDiv, null, { 'font-size': genericRowHeight + 'px' }),
      rowsDiv = create ('div', alignDiv, null, { 'font-family': 'Courier,monospace', 'font-size': genericRowHeight + 'px' })
  let ctx = treeCanvas.getContext('2d')
  ctx.fillStyle = nodeHandleFillStyle
  ctx.strokeStyle = branchStrokeStyle
  nodes.forEach ((node) => {
    let nameDiv = create ('div', namesDiv)
    let rowDiv = create ('div', rowsDiv)
    nameDiv.innerText = node
    rowDiv.innerText = rowData[node] || ''
    ctx.arc (nx[node], ny[node], nodeHandleRadius, 0, 2*Math.PI)
    ctx.fill()
    if (children[node].length) {
      ctx.setLineDash ([])
      children[node].forEach ((child) => {
        ctx.moveTo (nx[node], ny[node])
        ctx.lineTo (nx[node], ny[child])
        ctx.lineTo (nx[child], ny[child])
        ctx.stroke()
      })
    } else {
      ctx.setLineDash (rowConnectorDash)
      ctx.moveTo (nx[node], ny[node])
      ctx.lineTo (nx[node], treeWidth)
      ctx.stroke()
    }
  })
  return container
}

if (typeof(module) !== 'undefined')
  module.exports = render
