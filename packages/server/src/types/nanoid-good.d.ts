declare module 'nanoid-good' {
  type Generator = () => string

  const nanoidGood: {
    customAlphabet(
      ...locales: string[][]
    ): (alphabet: string, size: number) => Generator
  }

  export default nanoidGood
}

declare module 'nanoid-good/locale/en.js' {
  const words: string[]
  export default words
}
