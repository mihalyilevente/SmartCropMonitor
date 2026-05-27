import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'


function markdownRawPlugin() {
  return {
    name: 'vite-plugin-md-raw',
    transform(code, id) {
      if (!id.endsWith('.md')) return null;
      const escaped = code
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$\{/g, '\\${');
      return {
        code: `export default \`${escaped}\`;`,
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [
    markdownRawPlugin(),
    react(),
  ],
})