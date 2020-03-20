# tree-align-view

A multiple alignment viewer with integrated phylogeny and structure browsing.

For usage see the [demo](https://ihh.github.io/tree-align-view/html/demo.html) ([source](html/demo.html)).

Basically something like this:

~~~~
  let mainDiv = document.getElementById ('main')
  let opts = {
    data: {
      stockholm:  /* can also use Fasta, Newick, or JSON */
	"ATO98157.1/317-568   PNITNLCPFGEVFNATTF...\n"
      + "Q1T6X6_CVHSA/317-569 PNITNLCPFGEVFNATKF...\n"
      + "SPIKE_CVHSA/317-569  PNITNLCPFGEVFNATKF...\n",
      structure: {
        "SPIKE_CVHSA/317-569": {
          path: "pdb/5wrg.pdb",
          startPos: 317,
          chain: 'A'
        }
      }
    },
    config: {
      parent: mainDiv
    }
  }
  render (opts)
~~~~
