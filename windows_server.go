//go:build server

package main

// nativeWindows reports whether the app can open native windows. Server mode
// serves the frontend over HTTP and has none.
var nativeWindows = false
