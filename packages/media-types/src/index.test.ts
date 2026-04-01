import { MediaCategory } from '@xon/shared';
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_DEFINITIONS,
  EXTENSION_TO_CATEGORY,
  EXTENSION_TO_MIME,
  getMediaCategory,
} from './index.js';

describe('CATEGORY_DEFINITIONS', () => {
  it('defines all 20 media categories', () => {
    const expectedCategories = [
      MediaCategory.Movies,
      MediaCategory.TVShows,
      MediaCategory.Clips,
      MediaCategory.Music,
      MediaCategory.Audiobooks,
      MediaCategory.AudioClips,
      MediaCategory.Podcasts,
      MediaCategory.Pictures,
      MediaCategory.Images,
      MediaCategory.Textures,
      MediaCategory.HomeVideos,
      MediaCategory.Games,
      MediaCategory.InteractiveMedia,
      MediaCategory.Documents,
      MediaCategory.WebMedia,
      MediaCategory.DesignFiles,
      MediaCategory.Models3D,
      MediaCategory.Archives,
      MediaCategory.Fonts,
      MediaCategory.Icons,
    ];
    for (const category of expectedCategories) {
      expect(CATEGORY_DEFINITIONS).toHaveProperty(category);
    }
    expect(Object.keys(CATEGORY_DEFINITIONS)).toHaveLength(20);
  });

  it('each category has non-empty extensions array', () => {
    for (const [, info] of Object.entries(CATEGORY_DEFINITIONS)) {
      expect(info.extensions.length).toBeGreaterThan(0);
    }
  });

  it('each category has mimeTypes for all its extensions', () => {
    for (const [category, info] of Object.entries(CATEGORY_DEFINITIONS)) {
      for (const ext of info.extensions) {
        expect(
          info.mimeTypes,
          `${category} is missing MIME type for extension ${ext}`,
        ).toHaveProperty(ext);
      }
    }
  });

  it('all extensions start with a dot and are lowercase', () => {
    for (const [, info] of Object.entries(CATEGORY_DEFINITIONS)) {
      for (const ext of info.extensions) {
        expect(ext, `Extension "${ext}" must start with a dot`).toMatch(/^\./);
        expect(ext, `Extension "${ext}" must be lowercase`).toBe(
          ext.toLowerCase(),
        );
      }
    }
  });
});

describe('EXTENSION_TO_MIME', () => {
  it('maps common video extensions to correct MIME types', () => {
    expect(EXTENSION_TO_MIME['.mp4']).toBe('video/mp4');
    expect(EXTENSION_TO_MIME['.mkv']).toBe('video/x-matroska');
    expect(EXTENSION_TO_MIME['.avi']).toBe('video/x-msvideo');
  });

  it('maps common audio extensions to correct MIME types', () => {
    expect(EXTENSION_TO_MIME['.mp3']).toBe('audio/mpeg');
    expect(EXTENSION_TO_MIME['.flac']).toBe('audio/flac');
    expect(EXTENSION_TO_MIME['.wav']).toBe('audio/wav');
  });

  it('maps common image extensions to correct MIME types', () => {
    expect(EXTENSION_TO_MIME['.jpg']).toBe('image/jpeg');
    expect(EXTENSION_TO_MIME['.png']).toBe('image/png');
    expect(EXTENSION_TO_MIME['.gif']).toBe('image/gif');
  });

  it('maps document extensions to correct MIME types', () => {
    expect(EXTENSION_TO_MIME['.pdf']).toBe('application/pdf');
    expect(EXTENSION_TO_MIME['.epub']).toBe('application/epub+zip');
  });

  it('maps font extensions to correct MIME types', () => {
    expect(EXTENSION_TO_MIME['.ttf']).toBe('font/ttf');
    expect(EXTENSION_TO_MIME['.woff2']).toBe('font/woff2');
  });

  it('maps 3D model extensions to correct MIME types', () => {
    expect(EXTENSION_TO_MIME['.gltf']).toBe('model/gltf+json');
    expect(EXTENSION_TO_MIME['.glb']).toBe('model/gltf-binary');
  });

  it('is non-empty', () => {
    expect(Object.keys(EXTENSION_TO_MIME).length).toBeGreaterThan(0);
  });
});

describe('EXTENSION_TO_CATEGORY', () => {
  it('maps video extensions to Movies (primary video category)', () => {
    expect(EXTENSION_TO_CATEGORY['.mp4']).toBe(MediaCategory.Movies);
    expect(EXTENSION_TO_CATEGORY['.mkv']).toBe(MediaCategory.Movies);
  });

  it('maps audio extensions to Music (primary audio category)', () => {
    expect(EXTENSION_TO_CATEGORY['.mp3']).toBe(MediaCategory.Music);
    expect(EXTENSION_TO_CATEGORY['.flac']).toBe(MediaCategory.Music);
  });

  it('maps image extensions to Pictures (primary image category)', () => {
    expect(EXTENSION_TO_CATEGORY['.jpg']).toBe(MediaCategory.Pictures);
    expect(EXTENSION_TO_CATEGORY['.png']).toBe(MediaCategory.Pictures);
  });

  it('maps audiobook-specific extensions correctly', () => {
    expect(EXTENSION_TO_CATEGORY['.m4b']).toBe(MediaCategory.Audiobooks);
  });

  it('maps font extensions correctly', () => {
    expect(EXTENSION_TO_CATEGORY['.ttf']).toBe(MediaCategory.Fonts);
    expect(EXTENSION_TO_CATEGORY['.woff2']).toBe(MediaCategory.Fonts);
  });

  it('maps document extensions correctly', () => {
    expect(EXTENSION_TO_CATEGORY['.pdf']).toBe(MediaCategory.Documents);
    expect(EXTENSION_TO_CATEGORY['.epub']).toBe(MediaCategory.Documents);
  });

  it('maps 3D model extensions correctly', () => {
    expect(EXTENSION_TO_CATEGORY['.obj']).toBe(MediaCategory.Models3D);
    expect(EXTENSION_TO_CATEGORY['.gltf']).toBe(MediaCategory.Models3D);
  });

  it('maps archive extensions correctly', () => {
    expect(EXTENSION_TO_CATEGORY['.zip']).toBe(MediaCategory.Archives);
    expect(EXTENSION_TO_CATEGORY['.rar']).toBe(MediaCategory.Archives);
  });

  it('maps game extensions correctly', () => {
    expect(EXTENSION_TO_CATEGORY['.iso']).toBe(MediaCategory.Games);
    expect(EXTENSION_TO_CATEGORY['.nsp']).toBe(MediaCategory.Games);
  });

  it('is non-empty', () => {
    expect(Object.keys(EXTENSION_TO_CATEGORY).length).toBeGreaterThan(0);
  });
});

describe('getMediaCategory', () => {
  it('identifies category from simple filename', () => {
    expect(getMediaCategory('movie.mp4')).toBe(MediaCategory.Movies);
    expect(getMediaCategory('song.mp3')).toBe(MediaCategory.Music);
    expect(getMediaCategory('photo.jpg')).toBe(MediaCategory.Pictures);
    expect(getMediaCategory('document.pdf')).toBe(MediaCategory.Documents);
  });

  it('identifies category from full file path', () => {
    expect(getMediaCategory('/home/user/videos/movie.mkv')).toBe(
      MediaCategory.Movies,
    );
    expect(getMediaCategory('/music/library/artist/album/track.flac')).toBe(
      MediaCategory.Music,
    );
  });

  it('is case-insensitive for extensions', () => {
    expect(getMediaCategory('MOVIE.MP4')).toBe(MediaCategory.Movies);
    expect(getMediaCategory('Song.FLAC')).toBe(MediaCategory.Music);
    expect(getMediaCategory('archive.ZIP')).toBe(MediaCategory.Archives);
  });

  it('returns undefined for unknown extensions', () => {
    expect(getMediaCategory('file.xyz123')).toBeUndefined();
    expect(getMediaCategory('unknown.abc')).toBeUndefined();
  });

  it('returns undefined for files with no extension', () => {
    expect(getMediaCategory('Makefile')).toBeUndefined();
    expect(getMediaCategory('/path/to/noextension')).toBeUndefined();
  });

  it('identifies audiobook-specific format', () => {
    expect(getMediaCategory('book.m4b')).toBe(MediaCategory.Audiobooks);
  });

  it('identifies font formats', () => {
    expect(getMediaCategory('font.ttf')).toBe(MediaCategory.Fonts);
    expect(getMediaCategory('font.woff2')).toBe(MediaCategory.Fonts);
  });

  it('identifies 3D model formats', () => {
    expect(getMediaCategory('model.gltf')).toBe(MediaCategory.Models3D);
    expect(getMediaCategory('mesh.glb')).toBe(MediaCategory.Models3D);
  });
});
