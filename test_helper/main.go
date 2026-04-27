package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"

	"github.com/google/uuid"
)

type Config struct {
	OutputPath string `json:"output_path"`
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintf(os.Stderr, "usage: %s <n>\n", filepath.Base(os.Args[0]))
		os.Exit(1)
	}

	n, err := strconv.Atoi(os.Args[1])
	if err != nil || n < 0 {
		fmt.Fprintln(os.Stderr, "n must be a non-negative integer")
		os.Exit(1)
	}

	config, err := os.Open("config.json")
	if err != nil {
		panic(err)
	}
	defer config.Close()

	byteValue, err := io.ReadAll(config)
	if err != nil {
		panic(err)
	}

	var cfg Config
	err = json.Unmarshal(byteValue, &cfg)
	if err != nil {
		panic(err)
	}

	if cfg.OutputPath == "" {
		panic("output_path in config.json cannot be empty")
	}

	err = os.MkdirAll(cfg.OutputPath, 0o755)
	if err != nil {
		panic(err)
	}

	for i := 0; i < n; i++ {
		fileUUID := uuid.NewString()
		filePath := filepath.Join(cfg.OutputPath, fileUUID+".txt")

		err = os.WriteFile(filePath, []byte(fileUUID), 0o644)
		if err != nil {
			panic(err)
		}
	}

	fmt.Printf("created %d txt files in %s\n", n, cfg.OutputPath)

}
