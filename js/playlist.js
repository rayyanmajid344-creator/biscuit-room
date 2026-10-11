/*
 * Biscuit Room playlist.
 *
 * Two kinds of tracks are supported:
 *
 * 1. Generated tracks (the default). The music is composed live in the
 *    browser with the Web Audio API, so there are no files to download and
 *    no copyright to worry about. Each one is described by its tempo, key,
 *    chord progression and a seed that makes the melody repeatable.
 *
 * 2. Audio files. Put a royalty-free .mp3 in the /music folder (for example
 *    from Pixabay Music) and add an entry like:
 *      { title: "Morning coffee", artist: "Artist name", src: "music/morning-coffee.mp3" }
 *    Always check the track's license before adding it.
 */
window.BISCUIT_PLAYLIST = [
  {
    title: "Strawberry rain",
    artist: "Biscuit Room",
    bpm: 72,
    root: 53,                     // F3
    progression: [
      [0, 4, 7, 11, 14],          // Fmaj9
      [-3, 0, 4, 7, 11],          // Dm9
      [2, 5, 9, 12, 16],          // Gm9
      [-5, -1, 2, 5, 9]           // C9 (no 3rd on top)
    ],
    seed: 7,
    cover: "#f5d3e6"
  },
  {
    title: "Late night notes",
    artist: "Biscuit Room",
    bpm: 68,
    root: 50,                     // D3
    progression: [
      [0, 3, 7, 10, 14],          // Dm9
      [5, 9, 12, 16, 19],         // Gmaj9
      [-2, 2, 5, 9, 12],          // Bbmaj9
      [3, 7, 10, 14, 17]          // Fmaj9
    ],
    seed: 21,
    cover: "#dfe6ff"
  },
  {
    title: "Milk and cookies",
    artist: "Biscuit Room",
    bpm: 78,
    root: 55,                     // G3
    progression: [
      [0, 4, 7, 11, 14],          // Gmaj9
      [-1, 2, 7, 11, 14],         // D/F#
      [-3, 0, 4, 7, 11],          // Em9-ish
      [2, 5, 9, 12, 16]           // Am9
    ],
    seed: 42,
    cover: "#fff0c9"
  }
];
