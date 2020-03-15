let mainDiv = document.getElementById ('main')
let collapsed = {}
let opts = { root: 'root',
             branches: [['root', 'a', 1],
                        ['root', 'b', .5],
                        ['a', 'x', .1],
                        ['a', 'y', .2]],
             rowData: { x: 'AAGGCCAAGGCCAAGGCCAAGGCCAAGGCCAAGGCCAAGGCCAAGGCCAAGGCCAAGGCCAAGGCCAAGGCCAAGGCCAAGGCCAAGGCCAAGGCCAAGGCC',
                        y: 'GAAGTCGAAGTCGAAGTCGAAGTCGAAGTCGAAGTCGAAGTCGAAGTCGAAGTCGAAGTCGAAGTCGAAGTCGAAGTCGAAGTCGAAGTCGAAGTCGAAGTC',
                        b: 'GAGGTTGAGGTTGAGGTTGAGGTTGAGGTTGAGGTTGAGGTTGAGGTTGAGGTTGAGGTTGAGGTTGAGGTTGAGGTTGAGGTTGAGGTTGAGGTTGAGGTT',
                        root: '******************************************************************************************************',
                      },
             collapsed,
             handler: { nodeClicked: (node) => { collapsed[node] = !collapsed[node]; redraw() } },
             rowHeight: 24,
             parent: mainDiv }
const redraw = () => {
  mainDiv.innerHTML = ''
  render (opts)
}
redraw()
