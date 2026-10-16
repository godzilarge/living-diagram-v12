// The declared author (`ld-author`, typed in the v1 until accounts come with OAuth), read once for the page. Components
// take it from here, never from the storage.
import { useState } from "react";
import { readAuthor } from "../api/http";

export function useAuthor(): string {
  const [author] = useState(readAuthor);
  return author;
}
