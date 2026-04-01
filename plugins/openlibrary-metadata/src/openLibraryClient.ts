const OL_BASE = 'https://openlibrary.org';
const COVERS_BASE = 'https://covers.openlibrary.org';
const USER_AGENT =
  'Xon-MediaCenter/1.0 (https://github.com/xon-media-center/xon)';

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

// ─── OpenLibrary API response shapes ────────────────────────────────────────

interface OLSearchDoc {
  key: string;
  title: string;
  author_name?: string[];
  author_key?: string[];
  first_publish_year?: number;
  number_of_pages_median?: number;
  isbn?: string[];
  subject?: string[];
  cover_i?: number;
}

interface OLSearchResponse {
  docs: OLSearchDoc[];
}

interface OLIsbnBook {
  title: string;
  authors?: Array<{ key: string }>;
  number_of_pages?: number;
  publish_date?: string;
  subjects?: string[];
  covers?: number[];
}

interface OLAuthor {
  name?: string;
  bio?: string | { value: string };
}

// ─── Public types ────────────────────────────────────────────────────────────

export interface BookMetadata {
  title: string;
  authors: string[];
  authorBio?: string | undefined;
  coverUrl?: string | undefined;
  subjects: string[];
  publishYear?: number | undefined;
  pageCount?: number | undefined;
  isbn?: string | undefined;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class OpenLibraryClient {
  private readonly fetchFn: FetchFn;

  constructor(fetchFn: FetchFn) {
    this.fetchFn = fetchFn;
  }

  private async get<T>(url: string): Promise<T | null> {
    const res = await this.fetchFn(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  }

  /** Fetch author bio from OpenLibrary author endpoint. */
  private async fetchAuthorBio(authorKey: string): Promise<string | undefined> {
    const data = await this.get<OLAuthor>(`${OL_BASE}${authorKey}.json`);
    if (!data?.bio) return undefined;
    if (typeof data.bio === 'string') return data.bio;
    return data.bio.value;
  }

  /** Build a cover image URL from a cover ID. */
  private coverUrl(coverId: number): string {
    return `${COVERS_BASE}/b/id/${coverId}-L.jpg`;
  }

  /** Build a cover image URL from an ISBN. */
  private coverUrlByIsbn(isbn: string): string {
    return `${COVERS_BASE}/b/isbn/${isbn}-L.jpg`;
  }

  /**
   * Search by ISBN using the OpenLibrary Books API.
   * Preferred when an ISBN is available.
   */
  async searchByIsbn(isbn: string): Promise<BookMetadata | null> {
    const url = `${OL_BASE}/isbn/${isbn}.json`;
    const book = await this.get<OLIsbnBook>(url);
    if (!book) return null;

    // Resolve author names and bio
    const authors: string[] = [];
    let authorBio: string | undefined;
    if (book.authors && book.authors.length > 0) {
      for (const a of book.authors) {
        const author = await this.get<OLAuthor>(`${OL_BASE}${a.key}.json`);
        if (author?.name) {
          authors.push(author.name);
          if (!authorBio && author.bio) {
            authorBio =
              typeof author.bio === 'string' ? author.bio : author.bio.value;
          }
        }
      }
    }

    // Extract publish year from publish_date string (e.g. "January 1, 2003" or "2003")
    let publishYear: number | undefined;
    if (book.publish_date) {
      const m = /(\d{4})/.exec(book.publish_date);
      const yearStr = m?.[1];
      if (yearStr !== undefined) publishYear = Number.parseInt(yearStr, 10);
    }

    const coverUrl =
      book.covers && book.covers.length > 0 && book.covers[0] !== undefined
        ? this.coverUrl(book.covers[0])
        : this.coverUrlByIsbn(isbn);

    return {
      title: book.title,
      authors,
      authorBio,
      coverUrl,
      subjects: book.subjects ?? [],
      publishYear,
      pageCount: book.number_of_pages,
      isbn,
    };
  }

  /**
   * Search by title and optional author using the OpenLibrary Search API.
   * Fallback when no ISBN is available.
   */
  async searchByTitleAuthor(
    title: string,
    author?: string,
  ): Promise<BookMetadata | null> {
    const params = new URLSearchParams({ title, limit: '1' });
    if (author) params.set('author', author);
    const url = `${OL_BASE}/search.json?${params.toString()}`;

    const result = await this.get<OLSearchResponse>(url);
    const doc = result?.docs[0];
    if (!doc) return null;

    // Attempt to get author bio from first author key
    let authorBio: string | undefined;
    if (doc.author_key && doc.author_key.length > 0 && doc.author_key[0]) {
      authorBio = await this.fetchAuthorBio(doc.author_key[0]);
    }

    const coverUrl =
      doc.cover_i !== undefined ? this.coverUrl(doc.cover_i) : undefined;

    // Prefer a 13-digit ISBN
    const isbn =
      doc.isbn?.find((i) => i.length === 13) ??
      doc.isbn?.find((i) => i.length === 10);

    return {
      title: doc.title,
      authors: doc.author_name ?? [],
      authorBio,
      coverUrl,
      subjects: doc.subject?.slice(0, 20) ?? [],
      publishYear: doc.first_publish_year,
      pageCount: doc.number_of_pages_median,
      isbn,
    };
  }
}
