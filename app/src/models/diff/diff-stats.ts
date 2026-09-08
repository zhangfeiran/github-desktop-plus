/** Line counts for a file change, or an explicit binary marker. */
export type FileDiffStats =
  | {
      readonly kind: 'text'
      readonly linesAdded: number
      readonly linesDeleted: number
    }
  | { readonly kind: 'binary' }
