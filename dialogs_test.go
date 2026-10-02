package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestIgnoreCancel(t *testing.T) {
	t.Run("passes a result through", func(t *testing.T) {
		got, err := ignoreCancel("C:/file.txt", nil)
		if got != "C:/file.txt" || err != nil {
			t.Errorf("got (%q, %v), want (C:/file.txt, nil)", got, err)
		}
	})

	t.Run("cancelled becomes an empty result", func(t *testing.T) {
		for _, message := range []string{"cancelled", "Cancelled by user", "shell error: CANCELLED"} {
			got, err := ignoreCancel("stale", errors.New(message))
			if got != "" || err != nil {
				t.Errorf("%q: got (%q, %v), want empty result and nil error", message, got, err)
			}
		}
	})

	t.Run("cancelled multi-selection becomes nil", func(t *testing.T) {
		got, err := ignoreCancel([]string{"stale"}, errors.New("cancelled"))
		if got != nil || err != nil {
			t.Errorf("got (%v, %v), want (nil, nil)", got, err)
		}
	})

	t.Run("keeps other errors", func(t *testing.T) {
		want := errors.New("access denied")
		_, err := ignoreCancel("", want)
		if !errors.Is(err, want) {
			t.Errorf("err = %v, want %v", err, want)
		}
	})
}

func TestGetDownloadsFolder(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Skip("no home directory")
	}
	if got, want := NewApp().GetDownloadsFolder(), filepath.Join(home, "Downloads"); got != want {
		t.Errorf("GetDownloadsFolder() = %q, want %q", got, want)
	}
}
