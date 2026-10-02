import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import wails from '@wailsio/runtime/plugins/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	server: {
		host: '127.0.0.1',
		port: Number(process.env.WAILS_VITE_PORT) || 9245,
		strictPort: true
	},
	// Pre-bundle up front; deps discovered mid-session force a full reload that
	// cancels in-flight requests proxied by Wails ("Proxy error: context canceled").
	optimizeDeps: {
		include: [
			'@hugeicons/core-free-icons',
			'@hugeicons/svelte',
			'@tanstack/svelte-virtual',
			'@wailsio/runtime'
		]
	},
	plugins: [
		tailwindcss(),
		sveltekit(),
		paraglideVitePlugin({ project: './project.inlang', outdir: './src/lib/paraglide' }),
		wails('./bindings'),
		svelteTesting()
	],
	test: {
		environment: 'happy-dom',
		include: ['src/**/*.test.ts'],
		setupFiles: ['src/test/setup.ts'],
		coverage: {
			provider: 'v8',
			include: ['src/**/*.{ts,svelte}'],
			exclude: ['src/**/*.test.ts', 'src/test/**', 'src/lib/paraglide/**', 'src/**/*.d.ts'],
			reporter: ['text', 'html', 'json-summary'],
			// CI fails below these. Branches sit lower because v8 also counts
			// compiler-generated branches in Svelte templates.
			thresholds: { statements: 95, functions: 95, lines: 95, branches: 90 }
		}
	}
});
