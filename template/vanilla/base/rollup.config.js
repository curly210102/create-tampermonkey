// rollup.config.js
import { defineConfig } from 'rollup'

export default defineConfig({
  input: 'src/main.js',
  output: {
    file: 'bundle.js',
    format: 'iife'
  }
})
