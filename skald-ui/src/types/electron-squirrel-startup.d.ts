// The package ships no types: it exports a single boolean that is true when
// Squirrel launched the app for an install/update event (the app should quit).
declare module 'electron-squirrel-startup' {
  const started: boolean;
  export default started;
}
