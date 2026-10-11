# Adding your own music

Biscuit Room makes its own lo-fi music in the browser, so this folder can stay empty.

To add real songs:

1. Download a royalty-free track, for example from [Pixabay Music](https://pixabay.com/music/). Check its license first.
2. Put the `.mp3` file in this folder, for example `music/morning-coffee.mp3`.
3. Open `js/playlist.js` and add a line to the list:

```js
{ title: "Morning coffee", artist: "Artist name", src: "music/morning-coffee.mp3", cover: "#ffd9cc" },
```

The track then shows up in the player with the generated ones.
