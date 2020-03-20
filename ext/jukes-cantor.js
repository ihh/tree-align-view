var JukesCantor = (() => {
  const isGapChar = (c) => { return c == '-' || c == '.' }

  const getAlphabet = (seqs) => {
    let isChar = {}
    seqs.forEach ((seq) => seq.split('').forEach ((c) => {
      if (!isGapChar(c))
        isChar[c] = true
    }))
    return Object.keys(isChar).sort()
  }

  const getAlphabetSize = (seqs, opts) => {
    let alphabetSize = opts.alphabetSize
    if (!alphabetSize) {
      switch ((opts.alphabet || 'DNA').toUpperCase()) {
      case 'PROTEIN':
      case 'AMINO':
        alphabetSize = 20;
        break;
      case 'AUTO':
        alphabetSize = getAlphabet(seqs).length;
        break;
      case 'DNA':
      case 'RNA':
      default:
        alphabetSize = 4;
        break;
      }
    }
    return alphabetSize
  }

  const setCase = (seqs, opts) => {
    return opts.preserveCase ? seqs : seqs.map ((seq) => seq.toUpperCase())
  }

  const calcDistance = (seq1, seq2, opts) => {
    opts = opts || {}
    if (seq1.length != seq2.length)
      return Infinity
    const seqs = setCase ([seq1, seq2], opts)
    const alphabetSize = getAlphabetSize (seqs, opts)
    let diffs = 0, len = seqs[0].length
    for (let i = 0; i < seqs[0].length; ++i)
      if (seqs[0][i] != seqs[1][i])
        ++diffs
    const frac = diffs / len, eqmFrac = (alphabetSize - 1) / alphabetSize
    if (frac >= eqmFrac)
      return Infinity
    return Math.max (0, -eqmFrac * Math.log (1 - frac / eqmFrac))
  }

  const calcDistanceMatrix = (seqs, opts) => {
    opts = opts || {}
    seqs = setCase (seqs, opts)
    const alphabetSize = getAlphabetSize (seqs, opts)
    let d = new Array(seqs.length).fill(0).map ((row) => new Array(seqs.length).fill(0))
    for (let i = 0; i < seqs.length - 1; ++i)
      for (let j = i+1; j < seqs.length; ++j)
        d[i][j] = d[j][i] = calcDistance (seqs[i], seqs[j], { alphabetSize })
    return d
  }

  return { calcDistance, calcDistanceMatrix }
}) ()

