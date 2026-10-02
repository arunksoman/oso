import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import wails from '@wailsio/runtime/plugins/vite';
import { defineConfig } from 'vite';

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
		wails('./bindings')
	]
});
