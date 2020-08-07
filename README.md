# tree-align-view

A multiple alignment viewer with integrated phylogeny and structure browsing.

**Please note: this code is no longer maintained. It has been replaced by the ABrowse React component ([Github](https://github.com/ihh/abrowse); [demo](https://ihh.github.io/abrowse/)). This repository is left public for reference purposes only; you are strongly advised to use ABrowse instead.**

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
