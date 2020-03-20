# tree-align-view

A multiple alignment viewer with integrated phylogeny and structure browsing.

For usage see the [demo](https://ihh.github.io/tree-align-view/html/demo.html) ([source](html/demo.html)).

Basically something like this:

~~~~
  let mainDiv = document.getElementById ('main')
  let opts = {
    data: {
      stockholm:  /* can also use Fasta, Newick, or JSON */
        "U5LNM4_9BETC/366-630 AELT-ECDLDVLFKN-DA...\n"
      + "SPIKE_CVHN5/322-526  PNLP-DCDIDNWLNNVSV...\n"
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
