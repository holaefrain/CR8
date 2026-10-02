// Pure functions that turn Discogs API responses into CR8's shapes. Kept
// together so a Discogs format change shows up here (and in its fixture
// tests) instead of in several routes.

// "Moodymann (2)" → "Moodymann"
export const stripDisambiguation = name => String(name || '').replace(/\s*\(\d+\)/g, '');

export const joinArtists = artists =>
  stripDisambiguation((artists || []).map(a => a.name || a).join(', '));

export const releaseUrl = id => `https://www.discogs.com/release/${id}`;

export function mapTracklist(tracklist) {
  return (tracklist || [])
    .filter(t => t.type_ === 'track')
    .map(t => ({
      title: t.title,
      artist: t.artists ? joinArtists(t.artists) : '',
      duration: t.duration || '',
      position: t.position || '',
      bpm: '',
      key: '',
    }));
}

export const mapVideos = videos => (videos || []).map(v => ({ uri: v.uri, title: v.title || '' }));

// A search hit plus its full release detail → a search result card.
export function mapSearchResult(hit, detail) {
  const artist = (detail.artists || hit.title?.split(' - ') || [])
    .map(a => a.name || a)
    .join(', ')
    .replace(/\s*\(\d+\)$/, '');
  const genres = (detail.genres || hit.genre || []).join(', ');
  const styles = (detail.styles || hit.style || []).join(', ');
  return {
    artist,
    album: detail.title || hit.title || '',
    year: detail.year || hit.year || '',
    genre: styles || genres,
    label: (detail.labels || []).map(l => l.name).join(', '),
    tracks: mapTracklist(detail.tracklist),
    discogsId: hit.id,
    discogsUrl: releaseUrl(hit.id),
    thumb: hit.thumb || '',
  };
}

// Used when the release detail request fails — basic info, no tracks.
export function mapSearchHitOnly(hit) {
  const [artist = '', ...rest] = (hit.title || '').split(' - ');
  return {
    artist,
    album: rest.join(' - ') || hit.title || '',
    year: hit.year || '',
    genre: (hit.genre || []).join(', '),
    label: '',
    tracks: [],
    discogsId: hit.id,
    discogsUrl: releaseUrl(hit.id),
    thumb: hit.thumb || '',
  };
}

// Collection and wantlist items share the `basic_information` shape.
export function mapBasicInformation(info) {
  return {
    discogsId: info.id,
    artist: joinArtists(info.artists),
    album: info.title,
    year: info.year || '',
    genre: (info.genres || []).join(', '),
    styles: (info.styles || []).join(', '),
    label: (info.labels || []).map(l => l.name).join(', '),
    thumb: info.thumb || info.cover_image || '',
    formats: (info.formats || []).map(f => f.name).join(', '),
    discogsUrl: releaseUrl(info.id),
  };
}

export function mapPagination(p) {
  return {
    page: p?.page || 1,
    pages: p?.pages || 1,
    items: p?.items || 0,
    perPage: p?.per_page || 25,
  };
}

export function mapRelease(detail) {
  return {
    discogsId: detail.id,
    artist: joinArtists(detail.artists),
    album: detail.title || '',
    tracks: mapTracklist(detail.tracklist),
    videos: mapVideos(detail.videos),
  };
}

export function mapProfile(d) {
  return {
    username: d.username,
    name: d.name || d.username,
    avatar_url: d.avatar_url || '',
    num_collection: d.num_collection || 0,
    num_wantlist: d.num_wantlist || 0,
  };
}
