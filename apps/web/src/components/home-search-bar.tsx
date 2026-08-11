import { SearchCombobox } from '@/components/search-combobox';

/** Prominent search bar shown to authenticated users in place of the hero (Figma "HOME [Logged in]"). */
export function HomeSearchBar() {
  return <SearchCombobox variant="bar" />;
}
