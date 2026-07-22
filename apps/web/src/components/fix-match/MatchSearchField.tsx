import { Search20Regular as SearchIcon } from '@fluentui/react-icons'
import { Button, Flex, Label, Textbox } from '@xon/ui'

interface MatchSearchFieldProps {
  query: string
  onQueryChange: (query: string) => void
  onSearch: () => void
  isSearching: boolean
}

export default function MatchSearchField({
  query,
  onQueryChange,
  onSearch,
  isSearching,
}: MatchSearchFieldProps) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSearch()
      }}
    >
      <Label htmlFor="fix-match-search">Title</Label>
      <Flex gap="2" align="stretch">
        <Textbox
          id="fix-match-search"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          startIcon={<SearchIcon />}
          block
          autoFocus
        />
        <Button
          type="submit"
          variant="primary"
          loading={isSearching}
          disabled={!query.trim()}
        >
          Search
        </Button>
      </Flex>
    </form>
  )
}
